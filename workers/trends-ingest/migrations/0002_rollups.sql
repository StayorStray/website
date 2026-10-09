-- Daily rollups, maintained on ingest (one upsert per accepted event).
-- UI wording: stay = "Travel", stray = "Skip" (wire/storage names unchanged).
CREATE TABLE IF NOT EXISTS daily_place (
  day           TEXT NOT NULL,
  card_id       TEXT NOT NULL,
  tab           TEXT,
  place         TEXT,
  card_country  TEXT,
  travel        INTEGER NOT NULL DEFAULT 0,  -- action = stay
  skip          INTEGER NOT NULL DEFAULT 0,  -- action = stray
  undo_travel   INTEGER NOT NULL DEFAULT 0,  -- undo of a stay
  undo_skip     INTEGER NOT NULL DEFAULT 0,  -- undo of a stray
  spins         INTEGER NOT NULL DEFAULT 0,
  spin_removes  INTEGER NOT NULL DEFAULT 0,
  ad_clicks     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, card_id)
);
CREATE INDEX IF NOT EXISTS idx_daily_place_card ON daily_place (card_id, day);
CREATE INDEX IF NOT EXISTS idx_daily_place_tab ON daily_place (tab, day);

CREATE TABLE IF NOT EXISTS daily_tab (
  day        TEXT NOT NULL,
  tab        TEXT NOT NULL,
  deck_ends  INTEGER NOT NULL DEFAULT 0,
  sessions   INTEGER NOT NULL DEFAULT 0,  -- reserved
  PRIMARY KEY (day, tab)
);
