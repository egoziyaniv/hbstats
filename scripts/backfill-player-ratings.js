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
  // GameLineupEntry.rating is the OTHER source (some imports populate only
  // here, not GamePlayerStats). Mirror those into PlayerMatchRating too.
  const total = await prisma.gameLineupEntry.count({
    where: { rating: { not: null }, playerId: { not: null } },
  });
  console.log(`Migrating ${total} rated GameLineupEntry rows → PlayerMatchRating`);

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
        where: { gameId: r.gameId, playerId: r.playerId, source: 'api-football' },
        select: { id: true },
      });
      if (existing) {
        await prisma.playerMatchRating.update({ where: { id: existing.id }, data: { rating: value } });
      } else {
        await prisma.playerMatchRating.create({
          data: { gameId: r.gameId, playerId: r.playerId, source: 'api-football', rating: value },
        });
      }
      migrated++;
    }
    cursor = rows[rows.length - 1].id;
    if (migrated % 5000 === 0) console.log(`  lineup ${migrated}/${total}…`);
  }
  console.log(`Lineup ratings migrated: ${migrated}, skipped: ${skipped}`);
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

  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
