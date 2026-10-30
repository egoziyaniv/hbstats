'use strict';
/**
 * Pair RSSSF round numbers with our round-less, placeholder-dated league games.
 *
 * The historical migration created those games from scraped RSSSF rows but dropped the
 * round. A row and its game share season, home team, away team and score; nothing else
 * survives. In the three-round-robin seasons a pairing can repeat with the same score —
 * those games are indistinguishable in our data, so their rounds are handed out in round
 * order. A key whose row count differs from its game count is skipped (something else
 * created or removed games there), and nothing is written for it.
 *
 *   rows   [{ year, homeNameHe, awayNameHe, homeScore, awayScore, round }]   round: "Round 12"
 *   games  [{ id, year, homeNameHe, awayNameHe, homeScore, awayScore }]       round-less only
 *
 * Returns { updates: [{ gameId, roundNameEn }], skipped: [{ key, rows, games }] }.
 */
const roundNumber = (r) => Number((String(r || '').match(/(\d+)/) || [])[1]) || 0;
const keyOf = (x) => [x.year, x.homeNameHe, x.awayNameHe, x.homeScore, x.awayScore].join('|');

function planRoundBackfill(rows, games) {
  const rowsByKey = new Map();
  for (const r of rows) {
    if (!r.round) continue;
    const k = keyOf(r);
    if (!rowsByKey.has(k)) rowsByKey.set(k, []);
    rowsByKey.get(k).push(r);
  }
  const gamesByKey = new Map();
  for (const g of games) {
    const k = keyOf(g);
    if (!gamesByKey.has(k)) gamesByKey.set(k, []);
    gamesByKey.get(k).push(g);
  }

  const updates = [];
  const skipped = [];
  for (const [k, gs] of gamesByKey) {
    const rs = rowsByKey.get(k) || [];
    if (rs.length !== gs.length) { skipped.push({ key: k, rows: rs.length, games: gs.length }); continue; }
    const sortedRows = [...rs].sort((a, b) => roundNumber(a.round) - roundNumber(b.round));
    const sortedGames = [...gs].sort((a, b) => a.id.localeCompare(b.id));
    sortedGames.forEach((g, i) => updates.push({ gameId: g.id, roundNameEn: sortedRows[i].round }));
  }
  return { updates, skipped };
}

module.exports = { planRoundBackfill };
