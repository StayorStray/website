/**
 * Public, read-only aggregated scores for deck ordering (no personal data, no ids returned).
 * One vote per anonymous session per place: the session's final Travel/Skip on that card
 * (undone swipes don't count). Window: last 90 days of raw events.
 */
const PRIOR = 10, HOT_PER_TAB = 3, HOT_MIN = 10, HOT_DAYS = 30;

export async function buildScores(db, now) {
  const since = new Date(now - 90 * 86400000).toISOString().slice(0, 10);
  const rows = (await db.prepare(
    "SELECT card_id, tab, SUM(liked) AS travel, SUM(1 - liked) AS skip FROM (" +
    " SELECT session_id, card_id, MAX(tab) AS tab," +
    "  CASE WHEN SUM(action='stay') - SUM(action='undo' AND undo_of='stay') > 0 THEN 1 ELSE 0 END AS liked," +
    "  SUM(action IN ('stay','stray')) - SUM(action='undo') AS n" +
    " FROM events WHERE day >= ?1 AND card_id IS NOT NULL AND action IN ('stay','stray','undo')" +
    " GROUP BY session_id, card_id) WHERE n > 0 GROUP BY card_id"
  ).bind(since).all()).results || [];
  const places = {};
  let T = 0, N = 0;
  for (const r of rows) { places[r.card_id] = { tab: r.tab, travel: r.travel, skip: r.skip }; T += r.travel; N += r.travel + r.skip; }
  const avg = N ? T / N : 0.6;
  const today = new Date(now).toISOString().slice(0, 10);
  const byTab = {};
  for (const [id, p] of Object.entries(places)) {
    if (p.travel + p.skip < HOT_MIN || !p.tab) continue;
    (byTab[p.tab] ||= []).push([id, (p.travel + PRIOR * avg) / (p.travel + p.skip + PRIOR)]);
  }
  const stmts = [];
  for (const [tab, list] of Object.entries(byTab)) {
    list.sort((a, b) => b[1] - a[1]);
    for (const [id] of list.slice(0, HOT_PER_TAB)) {
      stmts.push(db.prepare('INSERT OR IGNORE INTO hottest (card_id, tab, since) VALUES (?1, ?2, ?3)').bind(id, tab, today));
    }
  }
  const cutoff = new Date(now - HOT_DAYS * 86400000).toISOString().slice(0, 10);
  stmts.push(db.prepare('DELETE FROM hottest WHERE since < ?1').bind(cutoff));
  await db.batch(stmts);
  const hottest = (await db.prepare('SELECT card_id, tab, since FROM hottest ORDER BY since').all()).results || [];
  return { generated: today, places, hottest };
}
