#!/usr/bin/env node
/**
 * import-european-games.js — import Israeli teams' games in the UEFA club
 * competitions (Champions League=2, Europa League=3, Conference League=848)
 * across seasons, from API-Football.
 *
 * Method (per the "import by competition, not by team" idea): for each
 * competition × season, GET /fixtures?league=&season= (all fixtures), keep the
 * ones where home OR away is one of our Israeli teams, and import those —
 * creating the foreign opponent team + the game, then (unless --no-details)
 * fetching lineups/events/statistics and projecting them (participantName for
 * players not in our DB; playerId when apiFootballId matches).
 *
 * Usage:
 *   node scripts/import-european-games.js                       # DRY discovery (all comps, 2016..2025)
 *   node scripts/import-european-games.js --season 2020         # one season
 *   node scripts/import-european-games.js --execute             # write games + teams
 *   node scripts/import-european-games.js --execute --details   # + events/lineups/stats
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(function loadEnv() {
  try {
    for (const line of fs.readFileSync(path.resolve(process.cwd(), '.env'), 'utf-8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!process.env[m[1]]) process.env[m[1]] = v;
    }
  } catch {}
})();

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const EXECUTE = process.argv.includes('--execute');
const DETAILS = process.argv.includes('--details');
const ONE_SEASON = arg('season') ? parseInt(arg('season'), 10) : null;
const KEY = process.env.API_FOOTBALL_KEY;
const BASE = process.env.API_FOOTBALL_BASE_URL || 'https://v3.football.api-sports.io';
if (!KEY) { console.error('Missing API_FOOTBALL_KEY'); process.exit(1); }

const COMPS = { 2: 'UEFA Champions League', 3: 'UEFA Europa League', 848: 'UEFA Europa Conference League' };
const SEASONS = ONE_SEASON ? [ONE_SEASON] : [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function af(pathQ, tries = 3) {
  for (let i = 1; i <= tries; i++) {
    try {
      const res = await fetch(`${BASE}${pathQ}`, { headers: { 'x-apisports-key': KEY } });
      const j = await res.json();
      if (j && Array.isArray(j.response)) return j.response;
      if (j && j.errors && Object.keys(j.errors).length) { await sleep(500); continue; }
      return [];
    } catch { await sleep(600); }
  }
  return [];
}

async function main() {
  console.log(`=== import-european-games ${EXECUTE ? '(EXECUTE)' : '(DRY)'}${DETAILS ? ' +details' : ''} seasons=${SEASONS.join(',')} ===\n`);
  // Israeli teams = distinct apiFootballId that ever had an Israeli league standing.
  const st = await prisma.standing.findMany({
    where: { competitionId: { in: ['comp_liga_haal', 'comp_liga_leumit'] } },
    select: { team: { select: { apiFootballId: true } } },
  });
  const ISR = new Set(st.map((r) => r.team?.apiFootballId).filter(Boolean));
  console.log(`Israeli team ids: ${ISR.size}\n`);

  const found = [];
  for (const [compAf, compName] of Object.entries(COMPS)) {
    for (const season of SEASONS) {
      const fixtures = await af(`/fixtures?league=${compAf}&season=${season}`);
      const rel = fixtures.filter((f) => ISR.has(f.teams?.home?.id) || ISR.has(f.teams?.away?.id));
      if (rel.length) console.log(`  ${compName} ${season}: ${rel.length} Israeli-team fixtures (of ${fixtures.length})`);
      for (const f of rel) found.push({ compAf: parseInt(compAf, 10), compName, season, f });
      await sleep(250);
    }
  }
  console.log(`\n=== TOTAL Israeli-team European fixtures: ${found.length} ===`);
  // Per-team breakdown
  const perTeam = {};
  for (const { f } of found) {
    for (const side of ['home', 'away']) {
      const t = f.teams[side];
      if (ISR.has(t.id)) perTeam[t.name] = (perTeam[t.name] || 0) + 1;
    }
  }
  console.log('By Israeli team:');
  Object.entries(perTeam).sort((a, b) => b[1] - a[1]).forEach(([n, c]) => console.log(`  ${n}: ${c}`));

  if (!EXECUTE) { console.log('\n[DRY] pass --execute to import.'); await prisma.$disconnect(); return; }

  // ---- EXECUTE ----
  const comps = await prisma.competition.findMany({ where: { apiFootballId: { in: [2, 3, 848] } }, select: { id: true, apiFootballId: true } });
  const compByAf = new Map(comps.map((c) => [c.apiFootballId, c.id]));
  const seasons = await prisma.season.findMany({ select: { id: true, year: true } });
  const seasonByYear = new Map(seasons.map((s) => [s.year, s.id]));

  const teamCache = new Map();
  let createdTeams = 0;
  async function resolveTeam(t, seasonId) {
    const key = `${t.id}|${seasonId}`;
    if (teamCache.has(key)) return teamCache.get(key);
    let team = await prisma.team.findUnique({ where: { apiFootballId_seasonId: { apiFootballId: t.id, seasonId } } }).catch(() => null);
    if (!team) {
      team = await prisma.team.create({ data: { apiFootballId: t.id, seasonId, nameEn: t.name, nameHe: t.name, logoUrl: t.logo || null } })
        .catch(async () => {
          const byName = await prisma.team.findUnique({ where: { nameEn_seasonId: { nameEn: t.name, seasonId } } }).catch(() => null);
          if (byName && !byName.apiFootballId) return prisma.team.update({ where: { id: byName.id }, data: { apiFootballId: t.id } }).catch(() => byName);
          return byName;
        });
      if (team) createdTeams++;
    }
    if (!team) return null;
    teamCache.set(key, team.id);
    return team.id;
  }

  let gamesUpserted = 0, detailed = 0, skipped = 0;
  for (const { compAf, season, f } of found) {
    const seasonId = seasonByYear.get(season);
    const competitionId = compByAf.get(compAf) || null;
    if (!seasonId) { skipped++; continue; }
    const homeTeamId = await resolveTeam(f.teams.home, seasonId);
    const awayTeamId = await resolveTeam(f.teams.away, seasonId);
    if (!homeTeamId || !awayTeamId) { skipped++; continue; }
    const status = mapStatus(f.fixture.status.short);
    const gdata = {
      seasonId, competitionId, homeTeamId, awayTeamId,
      dateTime: new Date(f.fixture.date),
      homeScore: f.goals.home, awayScore: f.goals.away,
      status, statusShort: f.fixture.status.short, statusLong: f.fixture.status.long,
      roundNameEn: f.league.round || null,
    };
    const game = await prisma.game.upsert({
      where: { apiFootballId: f.fixture.id },
      create: { apiFootballId: f.fixture.id, ...gdata },
      update: gdata,
    });
    gamesUpserted++;
    if (DETAILS && status === 'COMPLETED') {
      const ok = await projectDetails(game.id, f.fixture.id, f.teams.home.id, f.teams.away.id, homeTeamId, awayTeamId);
      if (ok) detailed++;
    }
  }
  console.log(`\n=== IMPORT DONE: games upserted=${gamesUpserted}, foreign teams created=${createdTeams}, detailed=${detailed}, skipped=${skipped} ===`);
  await prisma.$disconnect();
}

function mapStatus(short) {
  if (['FT', 'AET', 'PEN'].includes(short)) return 'COMPLETED';
  if (['1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE', 'INT'].includes(short)) return 'ONGOING';
  if (['PST', 'CANC', 'ABD', 'SUSP', 'AWD', 'WO'].includes(short)) return 'CANCELLED';
  return 'SCHEDULED';
}

const EV_TYPE = (t, d) => {
  if (t === 'Goal') return d && /own/i.test(d) ? 'OWN_GOAL' : d && /penalty/i.test(d) ? 'PENALTY_GOAL' : 'GOAL';
  if (t === 'Card') return /red/i.test(d) ? 'RED_CARD' : 'YELLOW_CARD';
  if (t === 'subst') return 'SUBST';
  return null;
};

// Fetch + project lineups/events/stats for one completed fixture. Players not in
// our DB are stored via participantName (playerId null) — same as matchday-update.
async function projectDetails(gameId, fixtureId, homeApi, awayApi, homeTeamId, awayTeamId) {
  const [lineups, events, stats] = await Promise.all([
    apiGet(`/fixtures/lineups?fixture=${fixtureId}`),
    apiGet(`/fixtures/events?fixture=${fixtureId}`),
    apiGet(`/fixtures/statistics?fixture=${fixtureId}`),
  ]);
  // player lookup by apiFootballId for the two teams (link when we have them)
  const dbPlayers = await prisma.player.findMany({
    where: { teamId: { in: [homeTeamId, awayTeamId] }, apiFootballId: { not: null } },
    select: { id: true, apiFootballId: true, teamId: true },
  });
  const pById = new Map(dbPlayers.map((p) => [`${p.apiFootballId}`, p.id]));
  const sideTeamId = (apiTeamId) => (apiTeamId === homeApi ? homeTeamId : awayTeamId);

  if (Array.isArray(events) && events.length) {
    await prisma.gameEvent.deleteMany({ where: { gameId } });
    for (const ev of events) {
      const type = EV_TYPE(ev.type, ev.detail);
      if (!type) continue;
      const teamId = sideTeamId(ev.team?.id);
      if (!teamId) continue;
      const side = teamId === homeTeamId ? 'home' : 'away';
      const pid = ev.player?.id ? pById.get(`${ev.player.id}`) || null : null;
      const aid = ev.assist?.id ? pById.get(`${ev.assist.id}`) || null : null;
      const min = ev.time?.elapsed ?? 0, extra = ev.time?.extra ?? null;
      if (ev.type === 'subst') {
        await prisma.gameEvent.create({ data: { gameId, team: side, teamId, type: 'SUBSTITUTION_IN', minute: min, extraMinute: extra, playerId: aid, participantName: ev.assist?.name || null, relatedPlayerId: pid, relatedParticipantName: ev.player?.name || null } }).catch(() => {});
        await prisma.gameEvent.create({ data: { gameId, team: side, teamId, type: 'SUBSTITUTION_OUT', minute: min, extraMinute: extra, playerId: pid, participantName: ev.player?.name || null, relatedPlayerId: aid, relatedParticipantName: ev.assist?.name || null } }).catch(() => {});
      } else {
        await prisma.gameEvent.create({ data: { gameId, team: side, teamId, type, minute: min, extraMinute: extra, playerId: pid, participantName: ev.player?.name || null, relatedPlayerId: aid, relatedParticipantName: ev.assist?.name || null } }).catch(() => {});
      }
    }
  }

  if (Array.isArray(lineups) && lineups.length) {
    await prisma.gameLineupEntry.deleteMany({ where: { gameId } });
    for (const tl of lineups) {
      const teamId = sideTeamId(tl.team?.id);
      if (!teamId) continue;
      const all = [...(tl.startXI || []).map((x) => ({ ...x, role: 'STARTER' })), ...(tl.substitutes || []).map((x) => ({ ...x, role: 'SUBSTITUTE' }))];
      for (const e of all) {
        const pl = e.player || {};
        await prisma.gameLineupEntry.create({ data: {
          gameId, teamId, role: e.role,
          playerId: pl.id ? pById.get(`${pl.id}`) || null : null,
          participantName: pl.name || null,
          jerseyNumber: pl.number ?? null, positionName: pl.pos ?? null,
          formation: tl.formation || null,
        } }).catch(() => {});
      }
    }
  }

  if (Array.isArray(stats) && stats.length === 2) {
    const num = (blk, key) => { const s = (blk.statistics || []).find((x) => x.type === key); const v = s?.value; if (typeof v === 'string' && v.endsWith('%')) return parseInt(v, 10); return typeof v === 'number' ? v : null; };
    const H = stats.find((s) => s.team?.id === homeApi) || stats[0];
    const A = stats.find((s) => s !== H) || stats[1];
    const data = {
      homeTeamPossession: num(H, 'Ball Possession'), awayTeamPossession: num(A, 'Ball Possession'),
      homeShotsTotal: num(H, 'Total Shots'), awayShotsTotal: num(A, 'Total Shots'),
      homeShotsOnTarget: num(H, 'Shots on Goal'), awayShotsOnTarget: num(A, 'Shots on Goal'),
      homeCorners: num(H, 'Corner Kicks'), awayCorners: num(A, 'Corner Kicks'),
      homeFouls: num(H, 'Fouls'), awayFouls: num(A, 'Fouls'),
      homeOffsides: num(H, 'Offsides'), awayOffsides: num(A, 'Offsides'),
      homeYellowCards: num(H, 'Yellow Cards'), awayYellowCards: num(A, 'Yellow Cards'),
      homeRedCards: num(H, 'Red Cards'), awayRedCards: num(A, 'Red Cards'),
    };
    await prisma.gameStatistics.upsert({ where: { gameId }, update: data, create: { gameId, ...data } }).catch(() => {});
  }
  return true;
}

// api helper for projectDetails
async function apiGet(pathQ) {
  for (let i = 1; i <= 3; i++) {
    try {
      const res = await fetch(`${BASE}${pathQ}`, { headers: { 'x-apisports-key': KEY } });
      const j = await res.json();
      if (j && Array.isArray(j.response)) return j.response;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return [];
}

main().catch(async (e) => { console.error('FATAL', e.message); await prisma.$disconnect(); process.exit(1); });
