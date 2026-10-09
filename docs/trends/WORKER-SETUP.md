# Turning on Spot and Travel trends (Cloudflare free tier)

Everything is built and merged, but **switched off**: `js/trends.js` ships with
`SOS_TRENDS = { enabled: false, endpoint: '' }`, so visitors' browsers make no trends calls.
These steps are all terminal commands (no dashboard clicking). Total time: about 10 minutes.

Names used: Worker **`spotandtravel-trends`**, D1 database **`spotandtravel-trends`** (binding `DB`).

## 0. One-time prerequisites
- A free Cloudflare account (sign up at https://dash.cloudflare.com/sign-up — the only browser step).
- Node.js 22 or newer (`node -v`). Wrangler 4 refuses to run on Node 20.

## 1. Log in
```bash
cd website/workers/trends-ingest
npx wrangler@4 login            # opens a browser once to authorize Wrangler
npx wrangler@4 whoami           # should print your account
```

## 2. Create the database and paste its id
```bash
npx wrangler@4 d1 create spotandtravel-trends
```
Copy the printed `database_id` into `workers/trends-ingest/wrangler.toml`, replacing
`00000000-0000-0000-0000-000000000000`.

## 3. Create the tables
```bash
npx wrangler@4 d1 migrations apply spotandtravel-trends --remote
```
(Applies `migrations/0001_events.sql` and `migrations/0002_rollups.sql`.)

## 4. Set the private report key
```bash
openssl rand -hex 24                      # copy the output, keep it somewhere safe
npx wrangler@4 secret put REPORT_KEY      # paste it when prompted
```
The key is stored only as a Worker secret. It is never committed and never goes in `js/trends.js`.

## 5. Deploy
```bash
npx wrangler@4 deploy
```
Copy the URL it prints, e.g. `https://spotandtravel-trends.<your-subdomain>.workers.dev`.

## 6. Smoke-test the live Worker (optional but recommended)
```bash
URL=https://spotandtravel-trends.<your-subdomain>.workers.dev
curl -s $URL/v1/health                                   # {"ok":true}
node test/smoke.mjs $URL <your REPORT_KEY>               # posts a few TEST events, checks report/auth/CORS
```
The smoke test writes a handful of test votes for `islands-001`/`islands-002`. Skip it if you want a perfectly clean start.

## 7. Paste the URL and enable the client
In `js/trends.js` change:
```js
var SOS_TRENDS = { enabled: false, endpoint: '' };
```
to:
```js
var SOS_TRENDS = { enabled: true, endpoint: 'https://spotandtravel-trends.<your-subdomain>.workers.dev' };
```
Commit and push to `main`. GitHub Pages redeploys in about 1–2 minutes.

## 8. Check it
- Open https://stayorstray.github.io/website/ and swipe a few cards. In DevTools → Network you should see one
  `POST …/v1/events` every few seconds (or on leaving the page). Swiping must still work if the Worker is down.
- Open https://stayorstray.github.io/website/pages/trends.html, paste the Worker URL and the REPORT_KEY,
  click **Load live data**. (The key is kept in sessionStorage for that tab only.) **View sample data** shows a
  clearly labelled SAMPLE DATA preview at any time.

## 9. Custom domain later
If the site moves to spotandtravel.com, it is already in `ALLOWED_ORIGINS` in `wrangler.toml`
(`https://spotandtravel.com`, `https://www.spotandtravel.com`). Add any other origin there and run `npx wrangler@4 deploy`.

## Turning it off again
Set `enabled: false` in `js/trends.js` and push. To delete data: `npx wrangler@4 d1 delete spotandtravel-trends`.

## Free-tier notes
Each accepted event costs 2 D1 row writes (raw event + daily rollup). The D1 free tier allows 100,000 row
writes/day (≈50,000 swipes/day) and Workers free allows 100,000 requests/day; the client batches up to 50 events
per request. A daily cron (04:17 UTC) deletes raw events older than `RAW_RETENTION_DAYS` (120); daily rollups are kept.

## Local development (no Cloudflare account needed)
```bash
cd workers/trends-ingest
cp .dev.vars.example .dev.vars     # add ALLOWED_ORIGINS=http://localhost:8765 for a local site
npx wrangler@4 d1 migrations apply spotandtravel-trends --local
npx wrangler@4 dev --local --port 8787
node test/smoke.mjs http://127.0.0.1:8787 <REPORT_KEY from .dev.vars>
```
To send events from a local copy of the site, serve it on http://localhost:8765 and set
`window.SOS_TRENDS_LOCAL = { enabled: true, endpoint: 'http://127.0.0.1:8787' }` before `js/trends.js` loads
(honoured only on localhost).
