# Cloudflare Worker setup (10 lines)

1. Install Wrangler: `npm i -g wrangler` then `wrangler login`.
2. From `workers/trends-ingest/`, run `wrangler d1 create stayorstray-trends` and paste the `database_id` into `wrangler.toml`.
3. Apply schema: `wrangler d1 migrations apply stayorstray-trends --remote`.
4. Deploy: `wrangler deploy` and copy the `*.workers.dev` (or custom) URL.
5. Confirm `POST /v1/events` returns 204/200 with a sample JSON body (no PII fields).
6. On the static site, set `SOS_TRENDS.endpoint` to that URL in `js/trends.js`.
7. Set `SOS_TRENDS.enabled = true` only after the URL is real (leave `false` until then).
8. Redeploy GitHub Pages (`StayorStray/website` main) so visitors load the client.
9. Spot-check: Stay/Stray still works with Worker stopped; DevTools shows beacon only when enabled.
10. Optional: lock Reporter/`pages/trends.html` behind a shared secret before sharing rollups.
