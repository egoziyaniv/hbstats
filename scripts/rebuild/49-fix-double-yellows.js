/**
 * 49-fix-double-yellows.js — convert duplicate YELLOW_CARD events into YELLOW_RED_CARD.
 *
 * Some scrapers emit a second yellow as a separate YELLOW_CARD event PLUS a
 * standalone RED_CARD at the same minute. That inflates per-player yellow
 * counts and leaderboards. We normalize the data:
 *
 *   1. For each (gameId, playerId) with 2+ YELLOW_CARD events, keep the
 *      earlier one as YELLOW_CARD and convert the later one to YELLOW_RED_CARD.
 *   2. If the same (gameId, playerId) also has a standalone RED_CARD event in
 *      the same game, delete it — the YELLOW_RED_CARD already represents the
 *      ejection. (Straight-red games keep their RED_CARD untouched.)
 *   3. Recompute PlayerStatistics.yellowCards across all affected players by
 *      counting YELLOW_CARD events per (player, season, competition).
 *
 * Run:
 *   node scripts/rebuild/49-fix-double-yellows.js               -- dry run
 *   node scripts/rebuild/49-fix-double-yellows.js --apply       -- write
 */

'use strict';

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

async function main() {
  console.log(`=== Fix double-yellows ${APPLY ? '(APPLY)' : '(dry-run)'} ===\n`);

  // 1. Find every (gameId, playerId) with 2+ YELLOW_CARD events.
  const duplicates = await prisma.$queryRaw`
    SELECT ge."gameId", ge."playerId", COUNT(*)::int AS yellow_count
    FROM game_events ge
    WHERE ge.type = 'YELLOW_CARD' AND ge."playerId" IS NOT NULL
    GROUP BY ge."gameId", ge."playerId"
    HAVING COUNT(*) > 1
  `;
  console.log(`Found ${duplicates.length} (game, player) pairs with 2+ yellows.`);

  let convertedYellows = 0;
  let deletedReds = 0;
  const affectedPlayerIds = new Set();

  for (const dup of duplicates) {
    const events = await prisma.gameEvent.findMany({
      where: { gameId: dup.gameId, playerId: dup.playerId, type: 'YELLOW_CARD' },
      orderBy: [{ minute: 'asc' }, { extraMinute: 'asc' }, { id: 'asc' }],
      select: { id: true, minute: true, extraMinute: true },
    });

    if (events.length < 2) continue;

    // Convert all but the FIRST yellow to YELLOW_RED_CARD. In practice
    // there are only two, but loop handles edge cases.
    for (let i = 1; i < events.length; i++) {
      if (APPLY) {
        await prisma.gameEvent.update({
          where: { id: events[i].id },
          data: { type: 'YELLOW_RED_CARD' },
        });
      }
      convertedYellows++;
    }

    // Drop a standalone RED_CARD that exists for the same player in the same
    // game — it's the duplicate of the YELLOW_RED_CARD we just created.
    const reds = await prisma.gameEvent.findMany({
      where: { gameId: dup.gameId, playerId: dup.playerId, type: 'RED_CARD' },
      select: { id: true },
    });
    if (reds.length > 0) {
      if (APPLY) {
        await prisma.gameEvent.deleteMany({
          where: { id: { in: reds.map((r) => r.id) } },
        });
      }
      deletedReds += reds.length;
    }

    affectedPlayerIds.add(dup.playerId);
  }

  console.log(`Converted ${convertedYellows} YELLOW_CARD → YELLOW_RED_CARD.`);
  console.log(`Deleted ${deletedReds} redundant standalone RED_CARD events.`);
  console.log(`Affected players (season-rows): ${affectedPlayerIds.size}`);

  // 2. Recompute PlayerStatistics.yellowCards for the affected players.
  // For each player whose canonical (or self) was touched, walk every linked
  // season-row and rebuild yellowCards from GameEvents grouped by (season, competition).
  if (APPLY && affectedPlayerIds.size > 0) {
    console.log('\nRecomputing PlayerStatistics.yellowCards…');
    let rebuiltRows = 0;
    for (const playerId of affectedPlayerIds) {
      const root = await prisma.player.findUnique({
        where: { id: playerId },
        select: { id: true, canonicalPlayerId: true },
      });
      if (!root) continue;
      const canonicalKey = root.canonicalPlayerId ?? root.id;
      const linked = await prisma.player.findMany({
        where: { OR: [{ id: canonicalKey }, { canonicalPlayerId: canonicalKey }] },
        select: { id: true },
      });
      const linkedIds = linked.map((p) => p.id);
      if (linkedIds.length === 0) continue;

      // Recompute yellow counts per (season, competition) from events.
      const counts = await prisma.$queryRaw`
        SELECT g."seasonId", g."competitionId", COUNT(*)::int AS yc
        FROM game_events ge
        JOIN games g ON g.id = ge."gameId"
        WHERE ge.type = 'YELLOW_CARD'
          AND ge."playerId" = ANY(${linkedIds}::text[])
        GROUP BY g."seasonId", g."competitionId"
      `;

      for (const c of counts) {
        if (!c.seasonId || !c.competitionId) continue;
        // Multiple PlayerStatistics rows can exist for the same (season,
        // competition) — one keyed on the canonical id and one on the
        // season-specific child. Update both so whichever the UI reads
        // shows the corrected count.
        const stats = await prisma.playerStatistics.findMany({
          where: { playerId: { in: linkedIds }, seasonId: c.seasonId, competitionId: c.competitionId },
          select: { id: true, yellowCards: true },
        });
        for (const stat of stats) {
          if (stat.yellowCards !== c.yc) {
            await prisma.playerStatistics.update({
              where: { id: stat.id },
              data: { yellowCards: c.yc },
            });
            rebuiltRows++;
          }
        }
      }
    }
    console.log(`Updated ${rebuiltRows} PlayerStatistics rows.`);
  } else if (!APPLY) {
    console.log('\n(dry-run — skipping PlayerStatistics recompute. Re-run with --apply.)');
  }

  console.log('\n✅ Done.');
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
