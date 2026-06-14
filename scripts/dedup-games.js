/**
 * Deduplicate games (security review H-2).
 *
 * A "duplicate" = games with the SAME season + home team + away team + competition
 * whose kickoff times are within 48h of each other (the same real match merged
 * twice from IFA/Walla with slightly different timestamps). Teams meeting again
 * later in the season (regular + playoff) are months apart and are NOT touched.
 *
 * Within each duplicate cluster we KEEP the richest row and delete the rest:
 *   score = (has apiFootball/footyStats id ? 1e6 : 0) + events*2 + lineups
 *   tie-break: earliest kickoff, then smallest id (stable).
 * Deleting a game cascades to its events/lineups/stats (FK onDelete: Cascade);
 * the kept row carries the canonical data.
 *
 * Dry-run by default. Pass --execute to delete. ALWAYS take a DB backup first.
 *   node scripts/dedup-games.js            # dry-run report
 *   node scripts/dedup-games.js --execute  # perform deletions
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const WINDOW_MS = 48 * 60 * 60 * 1000;

async function main() {
  const execute = process.argv.includes('--execute');
  console.log(`Mode: ${execute ? 'EXECUTE' : 'DRY-RUN'}\n`);

  const rows = await prisma.$queryRawUnsafe(`
    SELECT g.id, g."seasonId", g."homeTeamId", g."awayTeamId", COALESCE(g."competitionId",'-') AS comp,
      g."dateTime", g."homeScore", g."awayScore",
      (g."apiFootballId" IS NOT NULL OR g."footyStatsId" IS NOT NULL) AS has_source,
      (SELECT count(*)::int FROM game_events e WHERE e."gameId"=g.id) AS events,
      (SELECT count(*)::int FROM game_lineup_entries l WHERE l."gameId"=g.id) AS lineups
    FROM games g
    WHERE (g."seasonId", g."homeTeamId", g."awayTeamId") IN (
      SELECT "seasonId","homeTeamId","awayTeamId" FROM games GROUP BY 1,2,3 HAVING count(*) > 1
    )
    ORDER BY g."seasonId", g."homeTeamId", g."awayTeamId", comp, g."dateTime"
  `);

  // Group by season|home|away|comp, then cluster by <=48h proximity.
  const groups = new Map();
  for (const r of rows) {
    const k = `${r.seasonId}|${r.homeTeamId}|${r.awayTeamId}|${r.comp}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }

  const toDelete = [];
  const needsReview = [];
  let clusters = 0;

  for (const list of groups.values()) {
    list.sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime));
    let cluster = [list[0]];
    const flush = () => {
      if (cluster.length < 2) return;
      clusters++;
      const score = (g) => (g.has_source ? 1e6 : 0) + g.events * 2 + g.lineups;
      const sorted = [...cluster].sort(
        (a, b) => score(b) - score(a) || new Date(a.dateTime) - new Date(b.dateTime) || (a.id < b.id ? -1 : 1),
      );
      const keeper = sorted[0];
      for (const l of sorted.slice(1)) {
        // Only delete a loser the keeper FULLY DOMINATES on data, so we never
        // drop events/lineups the keeper lacks. Otherwise flag for manual review.
        const dominated = keeper.events >= l.events && keeper.lineups >= l.lineups;
        const rec = { ...l, keeperId: keeper.id, keeperEvents: keeper.events, keeperLineups: keeper.lineups };
        if (dominated) toDelete.push(rec);
        else needsReview.push(rec);
      }
    };
    for (let i = 1; i < list.length; i++) {
      const prev = cluster[cluster.length - 1];
      if (new Date(list[i].dateTime) - new Date(prev.dateTime) <= WINDOW_MS) cluster.push(list[i]);
      else { flush(); cluster = [list[i]]; }
    }
    flush();
  }

  const deletedWithData = toDelete.filter((l) => l.events > 0 || l.lineups > 0);
  console.log(`Duplicate clusters:        ${clusters}`);
  console.log(`Games to delete (safe):    ${toDelete.length}`);
  console.log(`  …carrying data the keeper already meets/exceeds: ${deletedWithData.length}`);
  console.log(`Flagged for MANUAL review (keeper does NOT dominate, NOT deleted): ${needsReview.length}`);
  if (needsReview.length) {
    needsReview.slice(0, 40).forEach((l) =>
      console.log(`  review: dup ${l.id} (e${l.events}/l${l.lineups}) vs keep ${l.keeperId} (e${l.keeperEvents}/l${l.keeperLineups})`),
    );
    if (needsReview.length > 40) console.log(`  …and ${needsReview.length - 40} more`);
  }

  if (execute && toDelete.length) {
    let done = 0;
    for (const l of toDelete) {
      await prisma.game.delete({ where: { id: l.id } });
      done++;
      if (done % 100 === 0) console.log(`  deleted ${done}/${toDelete.length}`);
    }
    console.log(`\nDeleted ${done} duplicate games.`);
  } else if (!execute) {
    console.log('\n(dry-run — nothing deleted; re-run with --execute)');
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
