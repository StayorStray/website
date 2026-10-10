-- Anonymous visit counting (docs/trends/VISITORS.md). No IPs, no raw visitor ids.
-- Salts: 'd:YYYY-MM-DD' (daily uniques) and 'm:YYYY-MM' (7/30-day uniques). Random, created on
-- first use, deleted by the cron once their period is over, so old hashes can't be re-linked.
CREATE TABLE IF NOT EXISTS visit_salts (
  period  TEXT PRIMARY KEY,
  salt    TEXT NOT NULL
);

-- Raw pageviews (pruned by the retention cron with the events table).
-- vh_day = sha256(daily salt + visitor id); vh_month = sha256(monthly salt + visitor id).
CREATE TABLE IF NOT EXISTS pageviews (
  event_id         TEXT PRIMARY KEY,
  ts               TEXT NOT NULL,
  day              TEXT NOT NULL,
  path             TEXT NOT NULL,
  ref              TEXT,            -- referrer domain only, NULL = direct / same site
  visitor_country  TEXT,            -- request.cf.country (approximate)
  vh_day           TEXT NOT NULL,
  vh_month         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pv_day ON pageviews (day, vh_day);
CREATE INDEX IF NOT EXISTS idx_pv_month ON pageviews (day, vh_month);
CREATE INDEX IF NOT EXISTS idx_pv_daypath ON pageviews (day, path, vh_day);

-- Daily rollups (kept forever). path = '*' is the whole site.
CREATE TABLE IF NOT EXISTS daily_visits (
  day        TEXT NOT NULL,
  path       TEXT NOT NULL,
  pageviews  INTEGER NOT NULL DEFAULT 0,
  uniques    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, path)
);
CREATE TABLE IF NOT EXISTS daily_ref (
  day        TEXT NOT NULL,
  ref        TEXT NOT NULL,
  pageviews  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, ref)
);

-- Running visit tally. A visit = one browser session: starts on the first pageview, or after
-- 30 minutes without a pageview (sessionStorage flag in js/trends.js). Year = calendar year in
-- America/Chicago. Never pruned.
CREATE TABLE IF NOT EXISTS yearly_visits (
  year    TEXT PRIMARY KEY,
  visits  INTEGER NOT NULL DEFAULT 0
);
