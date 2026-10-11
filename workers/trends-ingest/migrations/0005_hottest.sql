-- Hottest Locations: when a place first qualified, so it stays featured 30 days from then.
CREATE TABLE IF NOT EXISTS hottest (
  card_id  TEXT PRIMARY KEY,
  tab      TEXT NOT NULL,
  since    TEXT NOT NULL      -- YYYY-MM-DD it qualified
);
