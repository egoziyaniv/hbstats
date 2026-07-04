#!/usr/bin/env node
/**
 * backfill-standing-competition.js — assign Standing.competitionId where it is
 * null, ahead of moving the Standing unique key to (seasonId, teamId,
 * competitionId) (code-review H7).
 *
 * A null standing is a LEAGUE table row: either a legacy scrape from before
 * competitionId existed, or a bare row created by the admin points-adjustment
 * endpoint. We resolve the team's league for that season from its OWN league
 * games — the competition (apiFootballId 383 = Premier / 382 = National) it
 * played the most league games in that season. Rows with no league games are
 * reported and left untouched, unless --default-haal assigns comp_liga_haal.
 *
 * Because the CURRENT unique key is (seasonId, teamId), a null row is the only
 * row for its (season, team), so filling competitionId can never collide.
 *
 *   node scripts/backfill-standing-competition.js                 # dry-run report
 *   node scripts/backfill-standing-competition.js --execute       # write resolved rows
 *   node scripts/backfill-standing-competition.js --execute --default-haal
 */
'use strict';
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const EXECUTE = process.argv.includes('--execute');
const DEFAULT_HAAL = process.argv.includes('--default-haal');
const LEAGUE_API_IDS = [383, 382];

async function main() {
  console.log(EXECUTE ? '✓ EXECUTE' : '[DRY RUN]');

  const comps = await prisma.competition.findMany({ select: { id: true, apiFootballId: true, nameEn: true } });
  const compById = new Map(comps.map((c) => [c.id, c]));
  const leagueCompIds = comps.filter((c) => LEAGUE_API_IDS.includes(c.apiFootballId)).map((c) => c.id);
  const haal = comps.find((c) => c.apiFootballId === 383);

  const total = await prisma.standing.count();
  const nulls = await prisma.standing.findMany({
    where: { competitionId: null },
    select: {
      id: true, seasonId: true, teamId: true,
      team: { select: { nameHe: true, nameEn: true } },
      season: { select: { year: true, name: true } },
    },
    orderBy: [{ season: { year: 'asc' } }],
  });
  console.log(`Standing rows: ${total} total, ${nulls.length} with null competitionId\n`);
  if (!nulls.length) { await prisma.$disconnect(); return; }

  let resolved = 0, unresolved = 0, wrote = 0;
  const unresolvedList = [];
  const printed = [];

  for (const st of nulls) {
    const games = await prisma.game.findMany({
      where: {
        seasonId: st.seasonId,
        competitionId: { in: leagueCompIds },
        OR: [{ homeTeamId: st.teamId }, { awayTeamId: st.teamId }],
      },
      select: { competitionId: true },
    });
    const tally = new Map();
    for (const g of games) if (g.competitionId) tally.set(g.competitionId, (tally.get(g.competitionId) || 0) + 1);
    let best = null, bestN = 0;
    for (const [cid, n] of tally) if (n > bestN) { best = cid; bestN = n; }

    let target = best;
    let how = best ? `games:${bestN}` : null;
    if (!target && DEFAULT_HAAL && haal) { target = haal.id; how = 'default-haal'; }

    const name = st.team?.nameHe || st.team?.nameEn || st.teamId;
    if (!target) {
      unresolved++;
      unresolvedList.push(`  ${st.season?.year}  ${name}  (${st.id})`);
      continue;
    }
    resolved++;
    printed.push(`  ${st.season?.year}  ${name} → ${compById.get(target)?.nameEn} [${how}]`);

    if (EXECUTE) {
      const dup = await prisma.standing.findFirst({
        where: { seasonId: st.seasonId, teamId: st.teamId, competitionId: target, NOT: { id: st.id } },
        select: { id: true },
      });
      if (dup) { console.log(`  ! skip ${name} ${st.season?.year}: (season,team,comp) already on ${dup.id}`); continue; }
      await prisma.standing.update({ where: { id: st.id }, data: { competitionId: target } });
      wrote++;
    }
  }

  console.log(printed.slice(0, 60).join('\n'));
  if (printed.length > 60) console.log(`  … (+${printed.length - 60} more resolved)`);
  console.log(`\nResolved: ${resolved}, Unresolved: ${unresolved}${EXECUTE ? `, Written: ${wrote}` : ''}`);
  if (unresolvedList.length) {
    console.log(`\nUnresolved (no league games — left null${DEFAULT_HAAL ? '' : ', rerun with --default-haal to force comp_liga_haal'}):`);
    console.log(unresolvedList.join('\n'));
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
