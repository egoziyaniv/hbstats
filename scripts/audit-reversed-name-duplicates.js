'use strict';
/**
 * audit-reversed-name-duplicates.js — find Player rows that are the same person twice
 * on the same squad, stored once as "שם משפחה" and once reversed.
 *
 * Two importers disagreed on name order ("אליניב ברדה" vs "ברדה אליניב"), so a squad can
 * hold both rows and a player's record splits between them: Barda's 2014/15 goals hang off
 * the reversed row while his appearances hang off the other, showing 34 games and 0 goals.
 *
 * Signal: same teamId (one squad, one season) and the same multiset of name tokens in a
 * different order. Inside a single squad that cannot be two different people.
 *
 * Read-only. Use --team-name to limit the audit (default: Hapoel Be'er Sheva).
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const TEAM_NAME = process.argv.includes('--all') ? null : 'הפועל באר שבע';

const tokens = (n) =>
  (n || '').replace(/['"׳״]/g, '').split(/\s+/).filter(Boolean);
const key = (n) => tokens(n).slice().sort().join(' ');

(async () => {
  const teams = await prisma.team.findMany({
    where: TEAM_NAME ? { OR: [{ apiFootballId: 563 }, { nameHe: TEAM_NAME }] } : {},
    select: { id: true, nameHe: true, season: { select: { year: true } } },
  });

  let groups = 0;
  let blankNames = 0;
  const rows = [];

  for (const t of teams) {
    const squad = await prisma.player.findMany({
      where: { teamId: t.id },
      select: { id: true, nameHe: true, canonicalPlayerId: true },
    });
    const byKey = new Map();
    for (const s of squad) {
      const k = key(s.nameHe);
      if (!k) { blankNames++; continue; }
      byKey.set(k, [...(byKey.get(k) ?? []), s]);
    }
    for (const [, members] of byKey) {
      if (members.length < 2) continue;
      // Only interesting when the stored spellings actually differ (true duplicates,
      // not one row listed twice).
      const spellings = new Set(members.map((m) => m.nameHe));
      if (spellings.size < 2) continue;
      groups++;
      const counts = await Promise.all(
        members.map(async (m) => ({
          id: m.id,
          nameHe: m.nameHe,
          isChild: Boolean(m.canonicalPlayerId),
          lineups: await prisma.gameLineupEntry.count({ where: { playerId: m.id } }),
          events: await prisma.gameEvent.count({ where: { playerId: m.id } }),
        })),
      );
      rows.push({ year: t.season.year, team: t.nameHe, members: counts });
    }
  }

  console.log(`teams scanned: ${teams.length} | duplicate groups: ${groups} | blank-name rows skipped: ${blankNames}\n`);
  for (const r of rows.sort((a, b) => a.year - b.year)) {
    console.log(`${r.year} ${r.team}`);
    for (const m of r.members) {
      console.log(`    ${m.id.slice(0, 9)} ${String(m.nameHe).padEnd(28)} lineups=${String(m.lineups).padStart(3)} events=${String(m.events).padStart(3)} ${m.isChild ? 'child' : 'ROOT'}`);
    }
  }
  await prisma.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
