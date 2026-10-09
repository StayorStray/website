-- Partner-link breakdown for ad_click events ("Plan this trip" panel, docs/ads/TRACKING.md).
-- link_type: hotel | flight | car | things | cruise | klook (NULL for older ad_click rows).
ALTER TABLE events ADD COLUMN link_type TEXT;

CREATE TABLE IF NOT EXISTS daily_ad (
  day        TEXT NOT NULL,
  card_id    TEXT NOT NULL,
  tab        TEXT,
  link_type  TEXT NOT NULL,
  clicks     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, card_id, link_type)
);
CREATE INDEX IF NOT EXISTS idx_daily_ad_type ON daily_ad (link_type, day);
