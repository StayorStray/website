-- Raw events (frozen schema v1, see docs/trends/EVENT-SCHEMA.md).
-- No IP, no user names, no wheel home country, no removedIds, no lat/lng.
CREATE TABLE IF NOT EXISTS events (
  event_id        TEXT PRIMARY KEY,          -- client UUID v4, dedupe key
  session_id      TEXT NOT NULL,             -- random per tab session
  ts              TEXT NOT NULL,             -- ISO-8601 UTC (clamped server-side)
  day             TEXT NOT NULL,             -- YYYY-MM-DD (UTC) of ts
  hour            INTEGER NOT NULL,          -- 0-23 UTC
  action          TEXT NOT NULL,             -- stay|stray|undo|spin|spin_remove|ad_click|deck_end
  source          TEXT NOT NULL,             -- swipe|keyboard|button|wheel|ad|system
  card_id         TEXT,
  tab             TEXT,
  place           TEXT,
  card_country    TEXT,
  visitor_country TEXT,                      -- request.cf.country only
  path            TEXT,
  undo_of         TEXT,                      -- stay|stray when action = undo
  received_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_day ON events (day);
CREATE INDEX IF NOT EXISTS idx_events_card_day ON events (card_id, day);
