/**
 * fetch-fixture-team-stats.js — pull API-Football /fixtures/statistics
 * (per-team per-match stats) into GameStatistics.additionalInfo.apiFootball.
 *
 * Stores the full stat arrays under additionalInfo.apiFootball = { home, away }
 * (does NOT overwrite Flashscore xG or existing native columns). Also backfills
 * native columns (possession/shots/corners/fouls/cards) only when currently null.
 *
 * Note: API-Football does NOT provide xG for the Israeli league (expected_goals
 * is null), so Flashscore remains the xG source — we never touch homeXg/awayXg.
 *
 * Run: node scripts/fetch-fixture-team-stats.js [--limit N] [--season 2025] [--missing-only]
 */
'use strict';
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const env = fs.readFileSync(__dirname + '/../.env', 'utf8');
const API_KEY = (env.match(/API_FOOTBALL_KEY=(.+)/) || [])[1]?.trim();
const API_BASE = (env.match(/API_FOOTBALL_BASE_URL=(.+)/) || [])[1]?.trim() || 'https://v3.football.api-sports.io';

const arg = (n, d = null) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const LIMIT = parseInt(arg('limit', '8000'), 10);
const SEASON_YEAR = arg('season', null);
const MISSING_ONLY = process.argv.includes('--missing-only');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function pick(stats, type) {
  const row = (stats || []).find((s) => s.type === type);
  return row ? row.value : null;
}
const toInt = (v) => (v == null ? null : parseInt(String(v).replace('%', ''), 10) || (v === 0 ? 0 : null));

async function fetchStats(fixtureId, retries = 3) {
  for (let a = 0; a <= retries; a++) {
    try {
      const res = await fetch(`${API_BASE}/fixtures/statistics?fixture=${fixtureId}`, { headers: { 'x-apisports-key': API_KEY } });
      const data = await res.json();
      if (data.errors && Object.keys(data.errors).length && a < retries) { await sleep(1500 * (a + 1)); continue; }
      return data.response || [];
    } catch (e) { if (a < retries) { await sleep(1500 * (a + 1)); continue; } throw e; }
  }
  return [];
}

async function main() {
  if (!API_KEY) { console.error('No API key'); process.exit(1); }
  const where = { status: 'COMPLETED', apiFootballId: { not: null } };
  if (SEASON_YEAR) where.season = { year: parseInt(SEASON_YEAR, 10) };
  let games = await prisma.game.findMany({
    where, select: { id: true, apiFootballId: true, homeTeamId: true, gameStats: { select: { id: true, additionalInfo: true } } },
    orderBy: { dateTime: 'desc' }, take: LIMIT,
  });
  if (MISSING_ONLY) {
    games = games.filter((g) => {
      const ai = g.gameStats?.additionalInfo;
      return !(ai && typeof ai === 'object' && ai.apiFootball);
    });
  }
  console.log(`Fixture team-stats: ${games.length} games.`);

  let processed = 0, updated = 0, errors = 0;
  for (const g of games) {
    try {
      const resp = await fetchStats(g.apiFootballId);
      if (resp.length >= 1) {
        // resp[0] is home (matches API ordering), resp[1] away — but verify by team id
        const homeBlock = resp.find((r) => r.team?.id && g.homeTeamId) || resp[0];
        const home = resp[0]?.statistics || [];
        const away = resp[1]?.statistics || [];
        const merged = { ...(g.gameStats?.additionalInfo || {}), apiFootball: { home: resp[0]?.statistics || [], away: resp[1]?.statistics || [] } };
        const data = { additionalInfo: merged };
        // Backfill native columns only when null
        const cur = g.gameStats;
        const fillIf = (col, val) => { if (val != null) data[col] = val; };
        // Only set if the existing column is null — fetch current values
        const existing = cur?.id ? await prisma.gameStatistics.findUnique({ where: { id: cur.id } }) : null;
        if (existing) {
          if (existing.homeTeamPossession == null) fillIf('homeTeamPossession', toInt(pick(home, 'Ball Possession')));
          if (existing.awayTeamPossession == null) fillIf('awayTeamPossession', toInt(pick(away, 'Ball Possession')));
          if (existing.homeShotsTotal == null) fillIf('homeShotsTotal', toInt(pick(home, 'Total Shots')));
          if (existing.awayShotsTotal == null) fillIf('awayShotsTotal', toInt(pick(away, 'Total Shots')));
          if (existing.homeShotsOnTarget == null) fillIf('homeShotsOnTarget', toInt(pick(home, 'Shots on Goal')));
          if (existing.awayShotsOnTarget == null) fillIf('awayShotsOnTarget', toInt(pick(away, 'Shots on Goal')));
          if (existing.homeCorners == null) fillIf('homeCorners', toInt(pick(home, 'Corner Kicks')));
          if (existing.awayCorners == null) fillIf('awayCorners', toInt(pick(away, 'Corner Kicks')));
          if (existing.homeFouls == null) fillIf('homeFouls', toInt(pick(home, 'Fouls')));
          if (existing.awayFouls == null) fillIf('awayFouls', toInt(pick(away, 'Fouls')));
          await prisma.gameStatistics.update({ where: { id: existing.id }, data });
        } else {
          await prisma.gameStatistics.create({ data: { gameId: g.id, ...data } });
        }
        updated++;
      }
      processed++;
      if (processed % 100 === 0) console.log(`  ${processed}/${games.length}, updated ${updated}`);
      await sleep(280);
    } catch (e) { errors++; console.log(`  ! ${g.id}: ${e.message.slice(0, 70)}`); }
  }
  console.log(`\nDone. processed=${processed}, updated=${updated}, errors=${errors}`);
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
