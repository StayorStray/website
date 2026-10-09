-- One row per approved (captured) listing payment.
CREATE TABLE IF NOT EXISTS terms (
  payment_intent TEXT PRIMARY KEY,
  customer       TEXT,
  email          TEXT,
  sku            TEXT NOT NULL,
  pin            TEXT,
  auto_renew     INTEGER NOT NULL DEFAULT 0,
  term_start     TEXT NOT NULL,      -- go-live (metadata.go_live_at) or capture time, ISO
  term_end       TEXT NOT NULL,      -- term_start + 1 year
  subscriptions  TEXT,               -- JSON list of created subscription ids (auto-renew)
  reminder_sent  TEXT,               -- ISO time the renew-link reminder went out (one-time path)
  created_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_terms_end ON terms (auto_renew, reminder_sent, term_end);
