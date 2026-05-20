#!/usr/bin/env node
/**
 * Backfill PlayerStatistics.gamesPlayed from GameLineupEntry.
 *
 * Some rows have minutesPlayed > 0 or goals > 0 but gamesPlayed = 0 (e.g.
 * Or Blorian 2024 State Cup: 157 minutes, 0 games). The lineup data on
 * disk knows the truth — every game where the player started or came on
 * as a substitute. We count distinct games per (player+linked, season,
 * competition) and set gamesPlayed to that count when the existing value
 * is suspect (zero while there's other activity).
 *
 * Usage:
 *   node scripts/rebuild/48-backfill-games-played.js          # dry-run
 *   node scripts/rebuild/48-backfill-games-played.js --apply  # write
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const APPLY = process.argv.includes('--apply');

async function main() {
  console.log(APPLY ? '=== APPLY mode (writing) ===' : '=== DRY-RUN mode (no writes) ===');

  // Find candidate rows — gamesPlayed=0 but there's evidence the player
  // actually participated (minutes/goals/assists/cards > 0).
  const candidates = await prisma.playerStatistics.findMany({
    where: {
      gamesPlayed: 0,
      seasonId: { not: null },
      competitionId: { not: null },
      OR: [
        { minutesPlayed: { gt: 0 } },
        { goals: { gt: 0 } },
        { assists: { gt: 0 } },
        { yellowCards: { gt: 0 } },
        { redCards: { gt: 0 } },
      ],
    },
    select: {
      id: true,
      playerId: true,
      seasonId: true,
      competitionId: true,
      minutesPlayed: true,
      goals: true,
      assists: true,
    },
  });
  console.log(`Found ${candidates.length} suspect rows (gamesPlayed=0 with other activity)`);

  let updated = 0;
  let stillZero = 0;
  for (const row of candidates) {
    // Walk linked players (the row's playerId might be canonical, in which
    // case lineups live under per-season records).
    const owner = await prisma.player.findUnique({
      where: { id: row.playerId },
      select: { id: true, canonicalPlayerId: true },
    });
    if (!owner) continue;
    const canonId = owner.canonicalPlayerId ?? owner.id;
    const linked = await prisma.player.findMany({
      where: { OR: [{ id: canonId }, { canonicalPlayerId: canonId }] },
      select: { id: true },
    });
    const linkedIds = linked.map((p) => p.id);

    const lineups = await prisma.gameLineupEntry.findMany({
      where: {
        playerId: { in: linkedIds },
        role: { in: ['STARTER', 'SUBSTITUTE'] },
        game: {
          seasonId: row.seasonId,
          competitionId: row.competitionId,
          status: { in: ['COMPLETED', 'ONGOING'] },
        },
      },
      select: { gameId: true },
    });
    const distinctGames = new Set(lineups.map((l) => l.gameId)).size;

    if (distinctGames === 0) {
      stillZero++;
      continue;
    }

    if (APPLY) {
      await prisma.playerStatistics.update({
        where: { id: row.id },
        data: { gamesPlayed: distinctGames },
      });
    }
    updated++;
  }

  console.log('--- Summary ---');
  console.log(`Rows updated (gamesPlayed filled in): ${updated}`);
  console.log(`Rows still zero (no lineups found): ${stillZero}`);
  if (!APPLY) console.log('Re-run with --apply to write changes.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
}).finally(() => prisma.$disconnect());
