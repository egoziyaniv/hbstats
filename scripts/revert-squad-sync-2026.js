#!/usr/bin/env node
/**
 * revert-squad-sync-2026.js — undo the API-Football 2026/27 squad populate.
 *
 * The 2026/27 season had 0 players before sync-squads ran; every 2026-season
 * player row is sync-created. API-Football's squad endpoint returned a STALE
 * (≈ last-season) roster during the transfer window, so we remove it and will
 * repopulate from IFA/Walla when those publish the real roster.
 *
 * Safe-delete: match-data FKs (lineups/events/stats/ratings/transfers/trophies/
 * sidelined) are all zero for these rows (verified). The only references are
 * `canonicalPlayerId`: some non-2026 rows point at 2026 rows as their canonical
 * root (sync linked forward). We re-point each such child to a non-2026 sibling
 * (same apiFootballId), else self-canonical, BEFORE deleting — never orphaning.
 *
 *   node scripts/revert-squad-sync-2026.js            # dry-run
 *   node scripts/revert-squad-sync-2026.js --execute
 */
'use strict';
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const EXECUTE = process.argv.includes('--execute');

async function main() {
  console.log(EXECUTE ? '✓ EXECUTE' : '[DRY RUN]');
  const season = await prisma.season.findFirst({ where: { year: 2026 }, select: { id: true, name: true } });
  if (!season) { console.log('No 2026 season.'); return; }

  const teams = await prisma.team.findMany({ where: { seasonId: season.id }, select: { id: true } });
  const players = await prisma.player.findMany({
    where: { teamId: { in: teams.map((t) => t.id) } },
    select: { id: true, apiFootballId: true },
  });
  const pids = players.map((p) => p.id);
  const pidSet = new Set(pids);
  console.log(`Season ${season.name}: ${teams.length} teams, ${pids.length} player rows to remove.`);
  if (!pids.length) { return; }

  // External rows (non-2026) whose canonicalPlayerId points at a 2026 row.
  const children = await prisma.player.findMany({
    where: { canonicalPlayerId: { in: pids } },
    select: { id: true, apiFootballId: true, canonicalPlayerId: true },
  });
  const external = children.filter((c) => !pidSet.has(c.id));
  console.log(`Canonical children pointing at 2026 rows: ${children.length} total, ${external.length} external (need re-pointing).`);

  // Resolve a safe new canonical target for each external child.
  const repoints = [];
  for (const c of external) {
    let target = null;
    if (c.apiFootballId != null) {
      const sib = await prisma.player.findFirst({
        where: { apiFootballId: c.apiFootballId, id: { notIn: pids } },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      target = sib?.id ?? null;
    }
    // fall back to self-canonical (its own id) — never leave it pointing at a to-be-deleted row
    repoints.push({ childId: c.id, newCanonical: target ?? c.id });
  }

  console.log(`Re-points to apply: ${repoints.length}`);
  if (!EXECUTE) {
    console.log('\n[DRY RUN] would: re-point the above, then delete', pids.length, 'player rows. No writes.');
    await prisma.$disconnect();
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const r of repoints) {
      await tx.player.update({ where: { id: r.childId }, data: { canonicalPlayerId: r.newCanonical } });
    }
    // Null any 2026 rows' self/other canonical refs first is unnecessary — they're deleted together.
    const del = await tx.player.deleteMany({ where: { id: { in: pids } } });
    console.log(`Re-pointed ${repoints.length}, deleted ${del.count} player rows.`);
  });

  // Post-check: no dangling canonical refs to deleted ids.
  const dangling = await prisma.player.count({ where: { canonicalPlayerId: { in: pids } } });
  console.log(`Dangling canonical refs to deleted ids (should be 0): ${dangling}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
