/**
 * fetch-team-extras.js — per-team-season API-Football imports:
 *   /coachs?team=X            → TeamCoachAssignment (history of coaches)
 *   /injuries?team=X&season=Y → PlayerInjury (per-season injuries)
 *   /teams/statistics?team=X&season=Y&league=Z → TeamStatistics (aggregates)
 *
 * Scopes by teams that exist in our DB with an apiFootballId, optionally
 * filtered by --season. ~3 calls per team-season pair.
 *
 * Run:
 *   node scripts/fetch-team-extras.js [--season 2025] [--skip-coachs]
 *                                     [--skip-injuries] [--skip-stats]
 */
'use strict';
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const env = fs.readFileSync(__dirname + '/../.env', 'utf8');
const API_KEY = (env.match(/API_FOOTBALL_KEY=(.+)/) || [])[1]?.trim();
const API_BASE = (env.match(/API_FOOTBALL_BASE_URL=(.+)/) || [])[1]?.trim() || 'https://v3.football.api-sports.io';

const arg = (n, d = null) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const SEASON_YEAR = arg('season', null);
const SKIP_COACHS = process.argv.includes('--skip-coachs');
const SKIP_INJURIES = process.argv.includes('--skip-injuries');
const SKIP_STATS = process.argv.includes('--skip-stats');
const LEAGUE_API_ID = 383; // Ligat HaAl
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path, retries = 3) {
  for (let a = 0; a <= retries; a++) {
    try {
      const res = await fetch(`${API_BASE}${path}`, { headers: { 'x-apisports-key': API_KEY } });
      const data = await res.json();
      if (data.errors && Object.keys(data.errors).length && a < retries) { await sleep(1500 * (a + 1)); continue; }
      return data.response || [];
    } catch (e) { if (a < retries) { await sleep(1500 * (a + 1)); continue; } throw e; }
  }
  return [];
}

async function importCoachs(team) {
  // /coachs?team=X — returns coach objects with .career[]
  const coaches = await api(`/coachs?team=${team.apiFootballId}`);
  let inserted = 0;
  for (const c of coaches) {
    const apiId = c?.id;
    const name = c?.name || `${c?.firstname || ''} ${c?.lastname || ''}`.trim();
    if (!name) continue;
    const career = Array.isArray(c.career) ? c.career : [];
    for (const job of career) {
      if (job?.team?.id !== team.apiFootballId) continue;
      const start = job?.start ? new Date(job.start) : null;
      const end = job?.end ? new Date(job.end) : null;
      // Match a season by date range, fallback to current team's season
      const overlapping = await prisma.season.findFirst({
        where: { startDate: { lte: end || new Date() }, endDate: { gte: start || new Date('2000-01-01') } },
      });
      const seasonId = overlapping?.id || team.seasonId;
      try {
        await prisma.teamCoachAssignment.upsert({
          where: { teamId_seasonId_coachNameEn_startDate: { teamId: team.id, seasonId, coachNameEn: name, startDate: start } },
          create: { teamId: team.id, seasonId, coachNameEn: name, apiFootballCoachId: apiId, startDate: start, endDate: end },
          update: { apiFootballCoachId: apiId, endDate: end },
        });
        inserted++;
      } catch {}
    }
  }
  return inserted;
}

async function importInjuries(team, season) {
  const list = await api(`/injuries?team=${team.apiFootballId}&season=${season.year}`);
  let inserted = 0;
  for (const it of list) {
    const fxId = it?.fixture?.id ?? null;
    const playerApiId = it?.player?.id ?? null;
    if (!playerApiId) continue;
    const player = playerApiId ? await prisma.player.findFirst({ where: { apiFootballId: playerApiId } }).catch(() => null) : null;
    const game = fxId ? await prisma.game.findUnique({ where: { apiFootballId: fxId } }).catch(() => null) : null;
    try {
      await prisma.playerInjury.create({
        data: {
          apiFootballPlayerId: playerApiId,
          apiFootballTeamId: team.apiFootballId,
          apiFootballFixtureId: fxId,
          playerNameEn: it?.player?.name || null,
          teamNameEn: it?.team?.name || null,
          typeEn: it?.player?.type || null,
          reasonEn: it?.player?.reason || null,
          fixtureDate: it?.fixture?.date ? new Date(it.fixture.date) : null,
          seasonId: season.id,
          teamId: team.id,
          playerId: player?.id || null,
          gameId: game?.id || null,
        },
      });
      inserted++;
    } catch {}
  }
  return inserted;
}

async function importStats(team, season) {
  const resp = await api(`/teams/statistics?team=${team.apiFootballId}&season=${season.year}&league=${LEAGUE_API_ID}`);
  // resp is an OBJECT for this endpoint (not array)
  const s = Array.isArray(resp) ? resp[0] : resp;
  if (!s || !s.fixtures) return 0;
  const totalMatches = (s.fixtures.played?.total ?? 0);
  const data = {
    teamId: team.id, seasonId: season.id,
    competitionId: 'comp_liga_haal',
    matchesPlayed: totalMatches,
    wins: s.fixtures.wins?.total ?? 0,
    draws: s.fixtures.draws?.total ?? 0,
    losses: s.fixtures.loses?.total ?? 0,
    totalGoals: s.goals?.for?.total?.total ?? 0,
    goalsConceded: s.goals?.against?.total?.total ?? 0,
    cleanSheets: s.clean_sheet?.total ?? 0,
  };
  try {
    await prisma.teamStatistics.upsert({
      where: { teamId_seasonId_competitionId: { teamId: team.id, seasonId: season.id, competitionId: 'comp_liga_haal' } },
      create: data,
      update: data,
    });
    return 1;
  } catch (e) { console.log('  ! stats upsert:', e.message.slice(0,80)); return 0; }
}

async function main() {
  if (!API_KEY) { console.error('No API key'); process.exit(1); }
  const seasonWhere = SEASON_YEAR ? { year: parseInt(SEASON_YEAR, 10) } : { year: { gte: 2016 } };
  const seasons = await prisma.season.findMany({ where: seasonWhere, orderBy: { year: 'desc' } });
  console.log(`Seasons: ${seasons.map((s) => s.name).join(', ')}`);

  let totals = { coachs: 0, injuries: 0, stats: 0, apiCalls: 0 };
  for (const season of seasons) {
    const teams = await prisma.team.findMany({
      where: { seasonId: season.id, apiFootballId: { not: null } },
      select: { id: true, apiFootballId: true, nameHe: true, nameEn: true, seasonId: true },
    });
    console.log(`\n=== ${season.name}: ${teams.length} teams ===`);
    for (const team of teams) {
      try {
        if (!SKIP_COACHS) { totals.coachs += await importCoachs(team); totals.apiCalls++; await sleep(280); }
        if (!SKIP_INJURIES) { totals.injuries += await importInjuries(team, season); totals.apiCalls++; await sleep(280); }
        if (!SKIP_STATS) { totals.stats += await importStats(team, season); totals.apiCalls++; await sleep(280); }
      } catch (e) { console.log('  ! team', team.nameHe, e.message.slice(0, 80)); }
    }
    console.log(`  totals so far: coachs=${totals.coachs} injuries=${totals.injuries} stats=${totals.stats} apiCalls=${totals.apiCalls}`);
  }
  console.log(`\nDone. coachs=${totals.coachs}, injuries=${totals.injuries}, stats=${totals.stats}, apiCalls=${totals.apiCalls}`);
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
