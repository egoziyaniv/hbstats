/**
 * scrape-sofascore-ratings.js — fetch per-player ratings from Sofascore for
 * matches in a given season and persist them as PlayerMatchRating with
 * source='sofascore'.
 *
 * Approach:
 *   1. Resolve the Sofascore season id from a built-in map (we discovered
 *      these ids in an earlier session — Ligat HaAl = tournament 266).
 *   2. Walk every round 1..N, list events.
 *   3. For each event, fetch /lineups (contains ratings).
 *   4. Match each Sofascore player to our Player by name (Hebrew or English).
 *   5. Match the Sofascore event to our Game by date + home/away team name.
 *   6. Upsert one PlayerMatchRating per (gameId, playerId, 'sofascore').
 *
 * Usage:
 *   node scripts/scrape-sofascore-ratings.js --season 2025/26
 *   node scripts/scrape-sofascore-ratings.js --season 2025/26 --round 5
 *   node scripts/scrape-sofascore-ratings.js --season 2025/26 --limit 50
 */
'use strict';
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const SEASON_LABEL = arg('season', '2025/26');
const SPECIFIC_ROUND = arg('round', null);
const LIMIT = parseInt(arg('limit', '0'), 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Sofascore season ids per Ligat HaAl tournament (id 266). Discovered earlier
// via the /seasons endpoint. Format key matches our Season.name conventions.
const SOFASCORE_SEASONS = {
  '2025/26': 77635, '2024/25': 61932, '2023/24': 52328, '2022/23': 42248,
  '2021/22': 37133, '2020/21': 29316, '2019/20': 23996, '2018/19': 17539,
  '2017/18': 13491, '2016/17': 11940, '2015/16': 10489, '2014/15': 8672,
  '2013/14': 6865, '2012/13': 5069, '2011/12': 3617, '2010/11': 2879,
};

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36',
  'Accept': 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
};

async function fetchJson(url) {
  try {
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) { return null; }
}

function normalizeName(s) {
  return (s || '')
    .replace(/[.,'"`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

async function loadPlayerLookup(seasonId) {
  // Build name → playerId map for players in this season.
  const players = await prisma.player.findMany({
    where: { team: { seasonId } },
    select: { id: true, nameHe: true, nameEn: true, canonicalPlayerId: true, teamId: true },
  });
  const lookup = new Map();
  for (const p of players) {
    for (const key of [p.nameHe, p.nameEn].filter(Boolean).map(normalizeName)) {
      if (!lookup.has(key)) lookup.set(key, p.id);
    }
  }
  console.log(`Loaded ${players.length} players (${lookup.size} unique names) for season.`);
  return lookup;
}

async function loadGameLookup(seasonId) {
  // Build (homeName|awayName|dateISO) → gameId map.
  const games = await prisma.game.findMany({
    where: { seasonId, status: 'COMPLETED' },
    select: {
      id: true, dateTime: true,
      homeTeam: { select: { nameHe: true, nameEn: true } },
      awayTeam: { select: { nameHe: true, nameEn: true } },
    },
  });
  const lookup = new Map();
  for (const g of games) {
    const dateKey = g.dateTime.toISOString().slice(0, 10);
    const homeNames = [g.homeTeam.nameHe, g.homeTeam.nameEn].filter(Boolean).map(normalizeName);
    const awayNames = [g.awayTeam.nameHe, g.awayTeam.nameEn].filter(Boolean).map(normalizeName);
    for (const h of homeNames) for (const a of awayNames) lookup.set(`${dateKey}|${h}|${a}`, g.id);
  }
  console.log(`Loaded ${games.length} games for season.`);
  return lookup;
}

function matchGame(gameLookup, eventDateISO, homeName, awayName) {
  const date = new Date(eventDateISO).toISOString().slice(0, 10);
  const candidates = [
    `${date}|${normalizeName(homeName)}|${normalizeName(awayName)}`,
  ];
  // Try day before/after for timezone issues.
  for (const offset of [-1, 1]) {
    const d = new Date(eventDateISO);
    d.setUTCDate(d.getUTCDate() + offset);
    candidates.push(`${d.toISOString().slice(0, 10)}|${normalizeName(homeName)}|${normalizeName(awayName)}`);
  }
  for (const c of candidates) {
    if (gameLookup.has(c)) return gameLookup.get(c);
  }
  return null;
}

async function main() {
  const ssSeasonId = SOFASCORE_SEASONS[SEASON_LABEL];
  if (!ssSeasonId) { console.error(`No Sofascore id for season ${SEASON_LABEL}`); process.exit(1); }

  const season = await prisma.season.findFirst({ where: { name: SEASON_LABEL } });
  if (!season) { console.error(`No local season ${SEASON_LABEL}`); process.exit(1); }

  const [playerLookup, gameLookup] = await Promise.all([
    loadPlayerLookup(season.id),
    loadGameLookup(season.id),
  ]);

  let totalEvents = 0;
  let totalRatings = 0;
  let unmatchedGames = 0;
  let unmatchedPlayers = 0;

  const rounds = SPECIFIC_ROUND ? [parseInt(SPECIFIC_ROUND, 10)] : Array.from({ length: 36 }, (_, i) => i + 1);
  for (const round of rounds) {
    const eventsUrl = `https://api.sofascore.com/api/v1/unique-tournament/266/season/${ssSeasonId}/events/round/${round}`;
    const eventsData = await fetchJson(eventsUrl);
    if (!eventsData?.events?.length) continue;

    console.log(`Round ${round}: ${eventsData.events.length} events`);
    await sleep(400);
    for (const ev of eventsData.events) {
      if (LIMIT && totalEvents >= LIMIT) break;
      totalEvents++;
      const eventDate = new Date(ev.startTimestamp * 1000).toISOString();
      const gameId = matchGame(gameLookup, eventDate, ev.homeTeam?.name, ev.awayTeam?.name);
      if (!gameId) {
        unmatchedGames++;
        continue;
      }

      const lineupsUrl = `https://api.sofascore.com/api/v1/event/${ev.id}/lineups`;
      const lineups = await fetchJson(lineupsUrl);
      await sleep(300);
      if (!lineups) continue;

      for (const side of ['home', 'away']) {
        const players = lineups[side]?.players || [];
        for (const sp of players) {
          const rating = parseFloat(sp.statistics?.rating);
          if (!Number.isFinite(rating) || rating <= 0) continue;
          const ssName = sp.player?.name;
          if (!ssName) continue;
          const playerId = playerLookup.get(normalizeName(ssName));
          if (!playerId) { unmatchedPlayers++; continue; }

          const normalised = Math.max(0, Math.min(10, rating));
          const existing = await prisma.playerMatchRating.findFirst({
            where: { gameId, playerId, source: 'sofascore' },
            select: { id: true },
          });
          if (existing) {
            await prisma.playerMatchRating.update({ where: { id: existing.id }, data: { rating: normalised } });
          } else {
            await prisma.playerMatchRating.create({
              data: { gameId, playerId, source: 'sofascore', rating: normalised },
            });
          }
          totalRatings++;
        }
      }
    }
    if (LIMIT && totalEvents >= LIMIT) break;
  }

  console.log(`Done. events=${totalEvents}, ratings=${totalRatings}, unmatched-games=${unmatchedGames}, unmatched-players=${unmatchedPlayers}`);
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
