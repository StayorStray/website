/**
 * Spot and Travel — billing PREVIEW Worker (Stripe TEST mode).
 *
 *   POST /v1/stripe/webhook   Stripe webhook (payment_intent.succeeded = BoOnE captured/approved a hold)
 *   cron (daily)              renew-link reminder ~7 days before term end for one-time listings
 *
 * Auto-renew (metadata.renew = "yes", card saved via setup_future_usage=off_session):
 *   on capture -> create subscription(s) for the saved card, first charge one term after go-live:
 *     listing: yearly price, trial_end = go-live + 1 year  (Founding renews at the Standard $49.99/yr price)
 *     30-day pin: monthly $99 price, trial_end = go-live + 30 days
 *     7-day pin: one-time, no subscription
 *   Idempotency keys make webhook retries safe. go-live = metadata.go_live_at (unix/ISO) or capture time.
 */
const YEAR_S = 365 * 86400;
const MONTH_S = 30 * 86400;

const RENEWAL_PRICES = {
  test: {
    founding_standard: 'price_1UOmkIECBucDnUAX2anGInHt', // $49.99/yr
    standard: 'price_1UOmkIECBucDnUAX2anGInHt', // $49.99/yr
    hidden_gems: 'price_1UOmkUECBucDnUAXciJo91kd', // $99.99/yr
    pin_30d: 'price_1UOmkUECBucDnUAXy8frB35B', // $99/mo
  },
};
// One-time renew links used in reminder emails (the same card-hold Payment Links as the site).
const RENEW_LINKS = {
  test: {
    founding_standard: 'https://buy.stripe.com/test_eVq4gzghpciN0X6dKS0Jq02', // renews at Standard price
    standard: 'https://buy.stripe.com/test_eVq4gzghpciN0X6dKS0Jq02',
    hidden_gems: 'https://buy.stripe.com/test_cNiaEXghpaaF6hqdKS0Jq04',
  },
};

function json(body, status) {
  return new Response(JSON.stringify(body), { status: status || 200, headers: { 'Content-Type': 'application/json' } });
}

function hex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/** Stripe-Signature: t=..., v1=... ; HMAC-SHA256(secret, `${t}.${payload}`), 5-minute tolerance. */
export async function verifyStripeSignature(payload, header, secret, nowS) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(',').map((kv) => kv.split('=')).filter((p) => p.length === 2).map(([k, v]) => [k.trim(), v.trim()]));
  const sigs = header.split(',').filter((kv) => kv.trim().startsWith('v1=')).map((kv) => kv.trim().slice(3));
  const t = Number(parts.t);
  if (!t || !sigs.length || Math.abs((nowS || Date.now() / 1000) - t) > 300) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(t + '.' + payload)));
  return sigs.some((s) => safeEqual(s, mac));
}

async function stripe(env, method, path, params, idem) {
  const headers = { Authorization: 'Bearer ' + env.STRIPE_SECRET_KEY, 'Stripe-Version': '2024-06-20' };
  let body;
  if (params) {
    body = new URLSearchParams(params).toString();
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
  }
  if (idem) headers['Idempotency-Key'] = idem;
  const r = await fetch('https://api.stripe.com/v1' + path, { method, headers, body });
  const j = await r.json();
  if (j.error) {
    const e = new Error(j.error.message || 'stripe_error');
    e.status = r.status;
    e.stripe = { type: j.error.type, code: j.error.code };
    throw e;
  }
  return j;
}

function modeOf(obj) {
  return obj && obj.livemode ? 'live' : 'test';
}

function goLive(pi) {
  const raw = pi.metadata && pi.metadata.go_live_at;
  if (raw) {
    const n = /^\d+$/.test(raw) ? Number(raw) : Math.floor(Date.parse(raw) / 1000);
    if (n > 0) return n;
  }
  return Math.floor(Date.now() / 1000);
}

/** Plan for one captured PaymentIntent (pure; unit-tested). */
export function renewalPlan(pi, nowS) {
  const md = pi.metadata || {};
  if (md.site !== 'spot-and-travel') return { action: 'ignore', reason: 'not_spot_and_travel' };
  const sku = md.sku;
  const prices = RENEWAL_PRICES[modeOf(pi)] || {};
  if (!prices[sku]) return { action: 'ignore', reason: 'unknown_sku' };
  const start = nowS || goLive(pi);
  const pin = md.pin || (md.pin_30d === 'yes' ? 'pin30' : md.pin_7d === 'yes' ? 'pin7' : 'none');
  const base = { sku, pin, term_start: start, term_end: start + YEAR_S };
  if (md.renew !== 'yes') return Object.assign(base, { action: 'remind' });
  const subs = [{ kind: 'listing', price: prices[sku], trial_end: start + YEAR_S }];
  if (pin === 'pin30') subs.push({ kind: 'pin_30d', price: prices.pin_30d, trial_end: start + MONTH_S });
  return Object.assign(base, { action: 'subscribe', subs });
}

async function handleCaptured(env, pi) {
  const plan = renewalPlan(pi, goLive(pi));
  if (plan.action === 'ignore') return plan;
  const email = (pi.receipt_email || (pi.latest_charge && pi.latest_charge.billing_details && pi.latest_charge.billing_details.email)) || null;
  const created = [];
  if (plan.action === 'subscribe') {
    if (!pi.customer || !pi.payment_method) return { action: 'error', reason: 'no_saved_card' };
    for (const s of plan.subs) {
      const sub = await stripe(env, 'POST', '/subscriptions', {
        customer: pi.customer,
        'items[0][price]': s.price,
        default_payment_method: pi.payment_method,
        trial_end: String(s.trial_end),
        'trial_settings[end_behavior][missing_payment_method]': 'cancel',
        off_session: 'true',
        'metadata[site]': 'spot-and-travel',
        'metadata[kind]': s.kind,
        'metadata[sku]': plan.sku,
        'metadata[first_payment_intent]': pi.id,
        description: 'Spot and Travel ' + s.kind + ' renewal',
      }, 'sat-renew-' + pi.id + '-' + s.kind);
      created.push(sub.id);
    }
  }
  if (env.DB) {
    await env.DB.prepare(
      'INSERT OR IGNORE INTO terms (payment_intent, customer, email, sku, pin, auto_renew, term_start, term_end, subscriptions, created_at) ' +
      'VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)'
    ).bind(pi.id, pi.customer || null, email, plan.sku, plan.pin, plan.action === 'subscribe' ? 1 : 0,
      new Date(plan.term_start * 1000).toISOString(), new Date(plan.term_end * 1000).toISOString(),
      JSON.stringify(created), new Date().toISOString()).run();
  }
  return Object.assign({}, plan, { subscriptions: created });
}

async function sendReminder(env, row) {
  const link = (RENEW_LINKS.test[row.sku] || '') + (row.email ? '?prefilled_email=' + encodeURIComponent(row.email) : '');
  const subject = 'Your Spot and Travel listing ends on ' + row.term_end.slice(0, 10);
  const text = 'Hi,\n\nYour ' + row.sku.replace(/_/g, ' ') + ' listing on Spot and Travel ends on ' + row.term_end.slice(0, 10) +
    '. To keep it live for another year, renew here:\n' + link + '\n\nNo action needed if you want it to end. — Spot and Travel';
  if (!env.RESEND_API_KEY || !row.email) return { sent: false, preview: { to: row.email, subject, text } };
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: [row.email], subject, text }),
  });
  return { sent: r.ok, status: r.status };
}

export async function runReminders(env, nowMs) {
  if (!env.DB) return [];
  const days = Math.max(1, parseInt(env.REMINDER_DAYS_BEFORE || '7', 10) || 7);
  const cutoff = new Date((nowMs || Date.now()) + days * 86400000).toISOString();
  const rows = (await env.DB.prepare(
    'SELECT * FROM terms WHERE auto_renew = 0 AND reminder_sent IS NULL AND term_end <= ?1 LIMIT 50'
  ).bind(cutoff).all()).results || [];
  const out = [];
  for (const row of rows) {
    const res = await sendReminder(env, row);
    if (res.sent) {
      await env.DB.prepare('UPDATE terms SET reminder_sent = ?1 WHERE payment_intent = ?2')
        .bind(new Date().toISOString(), row.payment_intent).run();
    }
    out.push(Object.assign({ payment_intent: row.payment_intent }, res));
  }
  return out;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/v1/health') return json({ ok: true });
    if (url.pathname !== '/v1/stripe/webhook' || request.method !== 'POST') return json({ error: 'not_found' }, 404);
    const payload = await request.text();
    if (payload.length > 256 * 1024) return json({ error: 'too_large' }, 413);
    const ok = await verifyStripeSignature(payload, request.headers.get('Stripe-Signature'), env.STRIPE_WEBHOOK_SECRET);
    if (!ok) return json({ error: 'bad_signature' }, 400);
    let event;
    try { event = JSON.parse(payload); } catch (e) { return json({ error: 'bad_json' }, 400); }
    if (event.type !== 'payment_intent.succeeded') return json({ ok: true, ignored: event.type });
    try {
      const pi = event.data.object;
      // Re-fetch from Stripe so only Stripe's own data is trusted.
      const fresh = await stripe(env, 'GET', '/payment_intents/' + encodeURIComponent(pi.id) + '?expand[]=latest_charge');
      const res = await handleCaptured(env, fresh);
      return json({ ok: true, result: res });
    } catch (err) {
      console.error('billing error', err.message, JSON.stringify(err.stripe || {}));
      // 500 => Stripe retries (idempotency keys prevent duplicates once permissions are fixed).
      return json({ ok: false, error: err.message, stripe: err.stripe || null }, 500);
    }
  },
  async scheduled(event, env) {
    const out = await runReminders(env);
    console.log('reminders', JSON.stringify(out));
  },
};
