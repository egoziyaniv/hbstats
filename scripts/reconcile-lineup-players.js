/**
 * reconcile-lineup-players.js — link every GameLineupEntry to a Player.
 *
 * Many lineup entries arrive from IFA without a `playerId` (the participantName
 * is just a string). When that name doesn't match any Player on the team for
 * that season, the player effectively disappears from the team roster page
 * even though they did play.
 *
 * For each orphan entry:
 *   1. Find an existing Player on the team-season by exact name match.
 *   2. If none, create a new Player record and link to (team, season).
 *   3. Update GameLineupEntry.playerId.
 *
 * Re-runnable.
 */
'use strict';
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const DRY = process.argv.includes('--dry');
const LIMIT = parseInt(arg('limit', '0'), 10) || null;

async function main() {
  console.log(`Reconcile lineup players ${DRY ? '(DRY RUN)' : ''} ${LIMIT ? `limit=${LIMIT}` : ''}`);
  const orphans = await prisma.gameLineupEntry.findMany({
    where: {
      role: { in: ['STARTER', 'SUBSTITUTE'] },
      playerId: null,
      participantName: { not: null },
    },
    include: {
      team: { select: { id: true, seasonId: true, nameEn: true } },
    },
    ...(LIMIT ? { take: LIMIT } : {}),
  });
  console.log(`Orphan lineup entries: ${orphans.length}`);

  let linked = 0;
  let created = 0;
  let skipped = 0;
  const playerCache = new Map(); // key: teamId|name → playerId

  for (const o of orphans) {
    if (!o.participantName || !o.team) continue;
    const name = o.participantName.trim();
    const cacheKey = `${o.team.id}|${name}`;

    let playerId = playerCache.get(cacheKey);
    if (!playerId) {
      const existing = await prisma.player.findFirst({
        where: {
          teamId: o.team.id,
          OR: [{ nameEn: name }, { nameHe: name }],
        },
        select: { id: true },
      });
      if (existing) {
        playerId = existing.id;
      } else if (!DRY) {
        // Check if the jersey is already taken on this team — if so, omit it
        // to avoid a unique-constraint violation; this player gets no jersey.
        let jersey = o.jerseyNumber || null;
        if (jersey) {
          const jerseyOwner = await prisma.player.findFirst({
            where: { teamId: o.team.id, jerseyNumber: jersey },
            select: { id: true },
          });
          if (jerseyOwner) jersey = null;
        }
        const newPlayer = await prisma.player.create({
          data: {
            nameEn: name,
            nameHe: /[֐-׿]/.test(name) ? name : '',
            teamId: o.team.id,
            jerseyNumber: jersey,
          },
          select: { id: true },
        });
        playerId = newPlayer.id;
        created++;
      } else {
        created++;
      }
      if (playerId) playerCache.set(cacheKey, playerId);
    }

    if (!playerId) { skipped++; continue; }
    if (DRY) { linked++; continue; }
    await prisma.gameLineupEntry.update({
      where: { id: o.id },
      data: { playerId },
    });
    linked++;
  }

  console.log(`Linked: ${linked}`);
  console.log(`Created new Player records: ${created}`);
  console.log(`Skipped: ${skipped}`);
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
