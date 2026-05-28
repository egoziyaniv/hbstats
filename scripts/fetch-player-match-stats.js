/**
 * fetch-player-match-stats.js — pull per-player per-match stats from
 * API-Football's /fixtures/players endpoint into GamePlayerStats.
 *
 * One API call per game (returns both teams' players). Stores extracted common
 * columns + the full raw statistics object. Players are linked to our Player
 * rows by apiFootballId when possible.
 *
 * Run:
 *   node scripts/fetch-player-match-stats.js [--limit N] [--season 2025]
 *                                            [--game <gameId>] [--missing-only]
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
const ONE_GAME = arg('game', null);
const MISSING_ONLY = process.argv.includes('--missing-only');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const num = (v) => (typeof v === 'number' ? v : v == null ? null : parseInt(String(v), 10) || null);
const flt = (v) => (typeof v === 'number' ? v : v == null ? null : parseFloat(String(v)) || null);

async function fetchFixturePlayers(fixtureId, retries = 3) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${API_BASE}/fixtures/players?fixture=${fixtureId}`, {
        headers: { 'x-apisports-key': API_KEY },
      });
      const data = await res.json();
      if (data.errors && Object.keys(data.errors).length) {
        // Rate-limit or transient — back off
        if (attempt < retries) { await sleep(1500 * (attempt + 1)); continue; }
      }
      return data.response || [];
    } catch (e) {
      if (attempt < retries) { await sleep(1500 * (attempt + 1)); continue; }
      throw e;
    }
  }
  return [];
}

async function main() {
  if (!API_KEY) { console.error('No API_FOOTBALL_KEY'); process.exit(1); }

  const where = { status: 'COMPLETED', apiFootballId: { not: null } };
  if (SEASON_YEAR) where.season = { year: parseInt(SEASON_YEAR, 10) };
  if (ONE_GAME) where.id = ONE_GAME;

  let games = await prisma.game.findMany({
    where,
    select: { id: true, apiFootballId: true },
    orderBy: { dateTime: 'desc' },
    take: LIMIT,
  });

  if (MISSING_ONLY) {
    const filtered = [];
    for (const g of games) {
      const has = await prisma.gamePlayerStats.count({ where: { gameId: g.id } });
      if (has === 0) filtered.push(g);
    }
    games = filtered;
  }

  console.log(`Player-stats fetch: ${games.length} games to process.`);

  // Build apiFootballId → our playerId map for linking
  const playerRows = await prisma.player.findMany({
    where: { apiFootballId: { not: null } },
    select: { id: true, apiFootballId: true },
  });
  const playerByApi = new Map(playerRows.map((p) => [p.apiFootballId, p.id]));

  let processed = 0, rowsUpserted = 0, errors = 0, apiCalls = 0;
  for (const g of games) {
    try {
      const response = await fetchFixturePlayers(g.apiFootballId);
      apiCalls++;
      for (const teamBlock of response) {
        const teamApiId = teamBlock?.team?.id ?? null;
        for (const entry of teamBlock.players || []) {
          const apiPlayerId = entry?.player?.id;
          if (!apiPlayerId) continue;
          const st = entry.statistics?.[0] || {};
          await prisma.gamePlayerStats.upsert({
            where: { gameId_apiFootballPlayerId: { gameId: g.id, apiFootballPlayerId: apiPlayerId } },
            create: {
              gameId: g.id,
              apiFootballPlayerId: apiPlayerId,
              playerId: playerByApi.get(apiPlayerId) || null,
              playerName: entry.player?.name || null,
              rating: flt(st.games?.rating),
              minutes: num(st.games?.minutes),
              position: st.games?.position || null,
              captain: !!st.games?.captain,
              substitute: !!st.games?.substitute,
              goals: num(st.goals?.total),
              assists: num(st.goals?.assists),
              shotsTotal: num(st.shots?.total),
              shotsOn: num(st.shots?.on),
              passesTotal: num(st.passes?.total),
              passesKey: num(st.passes?.key),
              passAccuracy: num(st.passes?.accuracy),
              tacklesTotal: num(st.tackles?.total),
              interceptions: num(st.tackles?.interceptions),
              duelsTotal: num(st.duels?.total),
              duelsWon: num(st.duels?.won),
              dribblesAttempts: num(st.dribbles?.attempts),
              dribblesSuccess: num(st.dribbles?.success),
              foulsDrawn: num(st.fouls?.drawn),
              foulsCommitted: num(st.fouls?.committed),
              yellowCards: num(st.cards?.yellow),
              redCards: num(st.cards?.red),
              raw: st,
            },
            update: {
              playerId: playerByApi.get(apiPlayerId) || null,
              rating: flt(st.games?.rating),
              minutes: num(st.games?.minutes),
              raw: st,
            },
          });
          rowsUpserted++;
        }
      }
      processed++;
      if (processed % 50 === 0) console.log(`  ${processed}/${games.length} games, ${rowsUpserted} player rows, ${apiCalls} API calls`);
      await sleep(280); // stay under API rate limit
    } catch (e) {
      errors++;
      console.log(`  ! game ${g.id} (fix ${g.apiFootballId}): ${e.message.slice(0, 80)}`);
    }
  }

  console.log(`\nDone. games=${processed}, playerRows=${rowsUpserted}, apiCalls=${apiCalls}, errors=${errors}`);
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
