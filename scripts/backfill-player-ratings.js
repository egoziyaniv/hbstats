/**
 * backfill-player-ratings.js — copy GamePlayerStats.rating into the new
 * PlayerMatchRating table as source='api-football'.
 *
 * Re-runnable: upsert by (gameId, playerId, source).
 */
'use strict';
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function migrateLineupRatings() {
  // GameLineupEntry.rating is populated from Flashscore (per script
  // 44-flashscore-enrichment.js). Save as source='flashscore' so it lives
  // independently of API-Football ratings and feeds the unified average.
  const total = await prisma.gameLineupEntry.count({
    where: { rating: { not: null }, playerId: { not: null } },
  });
  console.log(`Migrating ${total} rated GameLineupEntry rows → PlayerMatchRating (source=flashscore)`);

  let migrated = 0, skipped = 0, cursor = undefined;
  while (true) {
    const rows = await prisma.gameLineupEntry.findMany({
      where: { rating: { not: null }, playerId: { not: null } },
      select: { id: true, gameId: true, playerId: true, rating: true },
      take: 1000,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
    });
    if (rows.length === 0) break;
    for (const r of rows) {
      const rating = typeof r.rating === 'number' ? r.rating : Number(r.rating);
      if (!Number.isFinite(rating) || rating <= 0) { skipped++; continue; }
      const value = Math.max(0, Math.min(10, rating));
      const existing = await prisma.playerMatchRating.findFirst({
        where: { gameId: r.gameId, playerId: r.playerId, source: 'flashscore' },
        select: { id: true },
      });
      if (existing) {
        await prisma.playerMatchRating.update({ where: { id: existing.id }, data: { rating: value } });
      } else {
        await prisma.playerMatchRating.create({
          data: { gameId: r.gameId, playerId: r.playerId, source: 'flashscore', rating: value },
        });
      }
      migrated++;
    }
    cursor = rows[rows.length - 1].id;
    if (migrated % 5000 === 0) console.log(`  lineup ${migrated}/${total}…`);
  }
  console.log(`Lineup ratings migrated: ${migrated}, skipped: ${skipped}`);
}

async function purgeMislabeledFlashscore() {
  // Earlier runs migrated GameLineupEntry.rating with source='api-football'.
  // Identify rows that don't have a matching GamePlayerStats (so they came
  // exclusively from Flashscore via GameLineupEntry) and re-label them.
  console.log('Re-labeling previously-mislabeled Flashscore ratings…');
  const result = await prisma.$queryRaw`
    UPDATE "player_match_ratings" pmr
    SET source = 'flashscore'
    WHERE pmr.source = 'api-football'
      AND pmr."sourceUserId" IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM "game_player_stats" gps
        WHERE gps."gameId" = pmr."gameId"
          AND gps."playerId" = pmr."playerId"
          AND gps.rating IS NOT NULL
      )
    RETURNING id
  `;
  console.log(`Re-labeled ${result.length} rows.`);
}

async function main() {
  const total = await prisma.gamePlayerStats.count({
    where: { rating: { not: null }, playerId: { not: null } },
  });
  console.log(`Migrating ${total} rated GamePlayerStats rows → PlayerMatchRating`);

  const batchSize = 1000;
  let migrated = 0;
  let skipped = 0;
  let cursor = undefined;

  while (true) {
    const rows = await prisma.gamePlayerStats.findMany({
      where: { rating: { not: null }, playerId: { not: null } },
      select: { id: true, gameId: true, playerId: true, rating: true },
      take: batchSize,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
    });
    if (rows.length === 0) break;

    for (const r of rows) {
      const rating = typeof r.rating === 'number' ? r.rating : Number(r.rating);
      if (!Number.isFinite(rating) || rating <= 0) { skipped++; continue; }
      const normalised = Math.max(0, Math.min(10, rating));
      // Manual upsert — Postgres unique on nullable sourceUserId doesn't fire
      // on NULL=NULL, so we lookup first then insert/update.
      const existing = await prisma.playerMatchRating.findFirst({
        where: { gameId: r.gameId, playerId: r.playerId, source: 'api-football' },
        select: { id: true },
      });
      if (existing) {
        await prisma.playerMatchRating.update({
          where: { id: existing.id },
          data: { rating: normalised },
        });
      } else {
        await prisma.playerMatchRating.create({
          data: {
            gameId: r.gameId,
            playerId: r.playerId,
            source: 'api-football',
            rating: normalised,
          },
        });
      }
      migrated++;
    }
    cursor = rows[rows.length - 1].id;
    if (migrated % 5000 === 0) console.log(`  ${migrated}/${total}…`);
  }

  console.log(`Done with GamePlayerStats. Migrated: ${migrated}, skipped: ${skipped}`);

  await migrateLineupRatings();
  await purgeMislabeledFlashscore();

  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
