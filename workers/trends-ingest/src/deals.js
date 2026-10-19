// GET /v1/deals — curated Travelpayouts promo offers, filtered server-side.
// Travelpayouts has no public promo-code API, so offers come from the DEALS_JSON
// var / secret (same shape as data/deals.json), copied from the dashboard's
// "Promo codes" tab with each offer's "Get promo link" URL.
export function buildDeals(env, now = new Date()) {
  let list = [];
  try { list = JSON.parse(env.DEALS_JSON || '{}').deals || []; } catch { list = []; }
  const day = now.toISOString().slice(0, 10);
  const deals = list
    .filter((d) => d && d.us_valid !== false)
    .filter((d) => (!d.end || d.end >= day) && (!d.start || d.start <= day))
    .filter((d) => /^https:\/\//.test(d.href || ''))
    .map(({ brand, kind, discount, text, start, end, flash, href, code }) => ({ brand, kind, discount, text, start, end, flash: !!flash, href, ...(code ? { code } : {}) }));
  return { updated: day, deals };
}
