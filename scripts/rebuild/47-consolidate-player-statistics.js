#!/usr/bin/env node
/**
 * Consolidate PlayerStatistics under canonical Player IDs.
 *
 * The data model assumes one row per (player, season, competition). Over
 * time we ended up with rows under per-season Player.id values, and script
 * 46 then created a parallel set under canonicalPlayerId. The result on a
 * single profile is duplicates that show "31 games at Beer Sheva + 34 games
 * at Maccabi PT" for the same season+league.
 *
 * For each canonical player:
 *   1. Find all linked records (canonical + children pointing at it)
 *   2. Pull all PlayerStatistics rows across those records
 *   3. Group by (seasonId, competitionId)
 *   4. Within each group, pick the "richest" row (highest gamesPlayed, then
 *      goals, then most fields populated)
 *   5. Keep that row but rewrite its playerId to the canonical id
 *   6. Delete the others in the group
 *
 * Idempotent — re-running is safe. Skips rows that are already canonical
 * and standalone.
 *
 * Usage:
 *   node scripts/rebuild/47-consolidate-player-statistics.js          # dry-run
 *   node scripts/rebuild/47-consolidate-player-statistics.js --apply  # write
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const APPLY = process.argv.includes('--apply');

function rowScore(r) {
  // Higher = richer. Used for tie-breaking duplicate rows.
  let s = (r.gamesPlayed ?? 0) * 1000;
  s += (r.goals ?? 0) * 100;
  s += (r.assists ?? 0) * 50;
  s += (r.minutesPlayed ?? 0);
  // Tiny bonus for non-null rating / position to prefer fuller rows.
  if (r.rating !== null && r.rating !== undefined) s += 1;
  if (r.position) s += 1;
  return s;
}

async function main() {
  console.log(APPLY ? '=== APPLY mode (writing) ===' : '=== DRY-RUN mode (no writes) ===');

  // Walk canonical players first so we can process them in one pass each.
  const canonicals = await prisma.player.findMany({
    where: { canonicalPlayerId: null },
    select: { id: true },
  });
  console.log(`Processing ${canonicals.length} canonical players...`);

  let moved = 0;
  let deleted = 0;
  let touchedCanonicals = 0;

  for (const canon of canonicals) {
    // Find all linked records (the canonical + its children).
    const linked = await prisma.player.findMany({
      where: { OR: [{ id: canon.id }, { canonicalPlayerId: canon.id }] },
      select: { id: true },
    });
    const linkedIds = linked.map((p) => p.id);
    if (linkedIds.length <= 1) continue; // single record, nothing to consolidate

    const stats = await prisma.playerStatistics.findMany({
      where: { playerId: { in: linkedIds } },
    });
    if (stats.length === 0) continue;

    // Group by (seasonId, competitionId).
    const groups = new Map();
    for (const s of stats) {
      const key = `${s.seasonId ?? 'null'}|${s.competitionId ?? 'null'}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(s);
    }

    let touched = false;
    for (const [, rows] of groups) {
      // Pick the richest row in this (season, competition) bucket.
      rows.sort((a, b) => rowScore(b) - rowScore(a));
      const winner = rows[0];
      const others = rows.slice(1);

      // Ensure the winner sits under the canonical id.
      const deletedIds = new Set();
      if (winner.playerId !== canon.id) {
        if (APPLY) {
          // First delete any row already at the canonical for this slot
          // (would block our update due to unique constraint). Capture which
          // ids we deleted so the subsequent loop doesn't try to re-delete.
          const blockers = await prisma.playerStatistics.findMany({
            where: {
              playerId: canon.id,
              seasonId: winner.seasonId,
              competitionId: winner.competitionId,
              id: { not: winner.id },
            },
            select: { id: true },
          });
          for (const b of blockers) deletedIds.add(b.id);
          if (blockers.length > 0) {
            await prisma.playerStatistics.deleteMany({
              where: { id: { in: blockers.map((b) => b.id) } },
            });
          }
          await prisma.playerStatistics.update({
            where: { id: winner.id },
            data: { playerId: canon.id },
          });
        }
        moved++;
        touched = true;
      }

      // Delete the duplicates.
      for (const dup of others) {
        if (deletedIds.has(dup.id)) continue; // already removed above
        if (APPLY) {
          try {
            await prisma.playerStatistics.delete({ where: { id: dup.id } });
          } catch (e) {
            if (e.code !== 'P2025') throw e; // P2025 = "Record to delete does not exist" — fine
          }
        }
        deleted++;
        touched = true;
      }
    }
    if (touched) touchedCanonicals++;
  }

  console.log('--- Summary ---');
  console.log(`Canonicals touched: ${touchedCanonicals}`);
  console.log(`Rows moved to canonical: ${moved}`);
  console.log(`Duplicates deleted: ${deleted}`);
  if (!APPLY) console.log('Re-run with --apply to write changes.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
}).finally(() => prisma.$disconnect());
