#!/usr/bin/env node
'use strict';
/** Read-only Hapoel Beer Sheva archive audit. node scripts/audit-club-archive.js --from 2000 --to 2026 --json /tmp/archive.json */
const LEAGUES = ['comp_liga_haal', 'comp_liga_leumit'];
const isClubName = (name) => String(name || '').replace(/["׳״'־-]/g, '').replace(/\s+/g, ' ').trim() === 'הפועל באר שבע' || String(name || '').replace(/["׳״']/g, '').replace(/\s+/g, ' ').trim() === 'הפועל בש';
const seasonYear = (label) => Number(String(label).match(/^\d{4}/)?.[0]);
const fixtureKey = (g) => [g.competitionId, g.homeTeamId, g.awayTeamId, new Date(g.dateTime).toISOString().slice(0, 10)].join('|');

function buildCoverageReport(data, { from = 2000, to = new Date().getFullYear() } = {}) {
  const rows = [];
  for (let year = from; year <= to; year++) {
    const season = data.seasons.find(s => s.year === year);
    if (!season) { rows.push({ year, issues: ['MISSING_SEASON'] }); continue; }
    const teams = data.teams.filter(t => t.seasonId === season.id);
    const teamIds = new Set(teams.map(t => t.id));
    const games = data.games.filter(g => g.seasonId === season.id && (teamIds.has(g.homeTeamId) || teamIds.has(g.awayTeamId)));
    const standings = teams.flatMap(t => t.standings).filter(s => LEAGUES.includes(s.competitionId));
    const competitions = [...new Set(standings.map(s => s.competitionId))];
    const expectedPlayed = standings.length ? Math.max(...standings.map(s => s.played)) : null;
    const leagueGames = games.filter(g => LEAGUES.includes(g.competitionId));
    const completed = leagueGames.filter(g => g.status === 'COMPLETED' && g.homeScore !== null && g.awayScore !== null);
    const completedLeagueGames = new Set(completed.map(fixtureKey)).size;
    const duplicateGames = leagueGames.length - new Set(leagueGames.map(fixtureKey)).size;
    const raw = new Map();
    for (const [kind, sourceRows] of [['matches', data.scrapedMatches], ['standings', data.scrapedStandings]]) {
      for (const r of sourceRows.filter(r => seasonYear(r.season) === year)) {
        if (!(kind === 'matches' ? isClubName(r.homeTeamName) || isClubName(r.awayTeamName) : isClubName(r.teamNameHe))) continue;
        const key = `${r.source}|${r.leagueNameHe || 'לא מסווג'}`;
        if (!raw.has(key)) raw.set(key, { source: r.source, league: r.leagueNameHe || 'לא מסווג', matches: 0, standings: 0 });
        raw.get(key)[kind]++;
      }
    }
    const issues = [];
    if (!teams.length) issues.push('MISSING_TEAM');
    if (!standings.length) issues.push('MISSING_STANDING');
    if (competitions.length > 1) issues.push('CONFLICTING_LEAGUES');
    if (expectedPlayed !== null && completedLeagueGames < expectedPlayed) issues.push('MISSING_GAMES');
    if (expectedPlayed !== null && completedLeagueGames > expectedPlayed) issues.push('GAME_COUNT_EXCEEDS_STANDING');
    if (duplicateGames) issues.push('DUPLICATE_FIXTURES');
    const unclassifiedGames = games.filter(g => !g.competitionId).length;
    if (unclassifiedGames) issues.push('UNCLASSIFIED_GAMES');
    rows.push({ year, seasonId: season.id, name: season.name, teamIds: [...teamIds], competitions, expectedPlayed, completedLeagueGames,
      missingGames: expectedPlayed === null ? null : Math.max(0, expectedPlayed - completedLeagueGames),
      totalGames: games.length, duplicateGames, unclassifiedGames,
      gamesWithoutLineups: completed.filter(g => g._count && !g._count.lineupEntries).length,
      rawSources: [...raw.values()], issues });
  }
  return { generatedAt: new Date().toISOString(), club: 'הפועל באר שבע', from, to,
    note: 'Coverage compares unique completed league fixtures with stored standings; equal totals do not certify source completeness. Zero events may be legitimate.', seasons: rows };
}

async function collectArchiveData(prisma) {
  const teams = await prisma.team.findMany({ where: { OR: [{ apiFootballId: 563 }, { nameHe: 'הפועל באר שבע' }] }, select: { id: true, seasonId: true, standings: { select: { competitionId: true, played: true } } } });
  const ids = teams.map(t => t.id);
  const [seasons, games, scrapedMatches, scrapedStandings] = await Promise.all([
    prisma.season.findMany({ select: { id: true, year: true, name: true }, orderBy: { year: 'asc' } }),
    prisma.game.findMany({ where: { OR: [{ homeTeamId: { in: ids } }, { awayTeamId: { in: ids } }] }, select: { id: true, seasonId: true, competitionId: true, homeTeamId: true, awayTeamId: true, dateTime: true, status: true, homeScore: true, awayScore: true, _count: { select: { events: true, lineupEntries: true } } } }),
    prisma.scrapedMatch.findMany({ where: { OR: [{ homeTeamName: { contains: 'באר' } }, { awayTeamName: { contains: 'באר' } }, { homeTeamName: { contains: 'ב\"ש' } }, { awayTeamName: { contains: 'ב\"ש' } }] }, select: { season: true, source: true, leagueNameHe: true, homeTeamName: true, awayTeamName: true } }),
    prisma.scrapedStanding.findMany({ where: { OR: [{ teamNameHe: { contains: 'באר' } }, { teamNameHe: { contains: 'ב\"ש' } }] }, select: { season: true, source: true, leagueNameHe: true, teamNameHe: true, played: true } }),
  ]);
  return { seasons, teams, games, scrapedMatches, scrapedStandings };
}

async function main() {
  const arg = (name) => { const i = process.argv.indexOf(`--${name}`); return i < 0 ? undefined : process.argv[i + 1]; };
  const from = Number(arg('from') || 2000), to = Number(arg('to') || new Date().getFullYear());
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1900 || to < from || to > 2100) throw new Error('Invalid year range');
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  try {
    const report = buildCoverageReport(await collectArchiveData(prisma), { from, to });
    const json = JSON.stringify(report, null, 2);
    if (arg('json')) require('fs').writeFileSync(arg('json'), json + '\n');
    console.log(json);
  } finally { await prisma.$disconnect(); }
}
module.exports = { buildCoverageReport, collectArchiveData };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
