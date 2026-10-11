CREATE TABLE IF NOT EXISTS crypto_orders (
  ref TEXT PRIMARY KEY,
  dest_tag INTEGER NOT NULL UNIQUE,
  sku TEXT NOT NULL,
  pin TEXT NOT NULL,
  usd_cents INTEGER NOT NULL,        -- list price
  charge_usd_cents INTEGER NOT NULL, -- after XRH discount
  currency TEXT NOT NULL,            -- RLUSD | XRP | XRH
  amount_json TEXT NOT NULL,         -- exact XRPL Amount requested
  amount_display TEXT NOT NULL,
  rate_json TEXT NOT NULL,           -- quote inputs (rates, sources, guards)
  payload_uuid TEXT,
  email TEXT, place_name TEXT,
  preview INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  status TEXT NOT NULL,              -- awaiting_payment | paid | rejected_payment | expired | declined
  tx_hash TEXT UNIQUE,
  delivered_json TEXT,
  verify_note TEXT,
  verified_at INTEGER
);
CREATE TABLE IF NOT EXISTS crypto_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  ref TEXT,
  kind TEXT NOT NULL,                -- quote | quote_refused | verify | webhook
  detail TEXT
);
CREATE INDEX IF NOT EXISTS crypto_events_ref ON crypto_events(ref);
