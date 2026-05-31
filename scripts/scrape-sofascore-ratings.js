/**
 * scrape-sofascore-ratings.js — Sofascore per-player ratings via
 * puppeteer-real-browser (defeats their Cloudflare protection). Saves into
 * PlayerMatchRating with source='sofascore'.
 *
 * Strategy:
 *   1. Open Sofascore via real browser, then use page.evaluate(() => fetch(...))
 *      so the request runs from the page origin (passes Cloudflare).
 *   2. Walk rounds 1..36, list events, fetch /lineups, extract ratings.
 *   3. Match players + games against our DB by name + date.
 *
 * Usage:
 *   node scripts/scrape-sofascore-ratings.js --season 2025/26
 *   node scripts/scrape-sofascore-ratings.js --season 2025/26 --round 5
 *   node scripts/scrape-sofascore-ratings.js --season 2025/26 --limit 50 --headful
 */
'use strict';
const { PrismaClient } = require('@prisma/client');
const { connect } = require('puppeteer-real-browser');
const prisma = new PrismaClient();

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const SEASON_LABEL = arg('season', '2025/26');
const SPECIFIC_ROUND = arg('round', null);
const LIMIT = parseInt(arg('limit', '0'), 10);
const HEADFUL = process.argv.includes('--headful');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SOFASCORE_SEASONS = {
  '2025/26': 77635, '2024/25': 61932, '2023/24': 52328, '2022/23': 42248,
  '2021/22': 37133, '2020/21': 29316, '2019/20': 23996, '2018/19': 17539,
  '2017/18': 13491, '2016/17': 11940, '2015/16': 10489, '2014/15': 8672,
  '2013/14': 6865, '2012/13': 5069, '2011/12': 3617, '2010/11': 2879,
};

function normalizeName(s) {
  return (s || '').replace(/[.,'"`]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

async function loadPlayerLookup(seasonId) {
  const players = await prisma.player.findMany({
    where: { team: { seasonId } },
    select: { id: true, nameHe: true, nameEn: true },
  });
  const lookup = new Map();
  for (const p of players) {
    for (const key of [p.nameHe, p.nameEn].filter(Boolean).map(normalizeName)) {
      if (!lookup.has(key)) lookup.set(key, p.id);
    }
  }
  console.log(`Loaded ${players.length} players (${lookup.size} unique names).`);
  return lookup;
}

async function loadGameLookup(seasonId) {
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
  console.log(`Loaded ${games.length} games.`);
  return lookup;
}

function matchGame(gameLookup, eventDateISO, homeName, awayName) {
  const date = new Date(eventDateISO).toISOString().slice(0, 10);
  const home = normalizeName(homeName);
  const away = normalizeName(awayName);
  const candidates = [`${date}|${home}|${away}`];
  for (const offset of [-1, 1]) {
    const d = new Date(eventDateISO);
    d.setUTCDate(d.getUTCDate() + offset);
    candidates.push(`${d.toISOString().slice(0, 10)}|${home}|${away}`);
  }
  for (const c of candidates) if (gameLookup.has(c)) return gameLookup.get(c);
  return null;
}

async function pageFetchJson(page, url) {
  // Navigate the page to the API URL — the response is JSON wrapped in a
  // <pre> tag (Chrome's default JSON viewer). Extract and parse the body text.
  try {
    const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    if (!res || !res.ok()) return null;
    const text = await page.evaluate(() => document.body?.innerText || '');
    if (!text || text.trim()[0] !== '{') return null;
    return JSON.parse(text);
  } catch { return null; }
}

async function main() {
  const ssSeasonId = SOFASCORE_SEASONS[SEASON_LABEL];
  if (!ssSeasonId) { console.error(`No Sofascore id for season ${SEASON_LABEL}`); process.exit(1); }
  const season = await prisma.season.findFirst({ where: { name: SEASON_LABEL } });
  if (!season) { console.error(`No local season ${SEASON_LABEL}`); process.exit(1); }

  const [playerLookup, gameLookup] = await Promise.all([
    loadPlayerLookup(season.id), loadGameLookup(season.id),
  ]);

  console.log('Opening Sofascore via puppeteer-real-browser…');
  const { browser, page } = await connect({
    headless: !HEADFUL,
    turnstile: true,
    args: ['--lang=en-US,en'],
    customConfig: {},
    connectOption: {},
    disableXvfb: false,
  });

  try {
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto('https://www.sofascore.com/tournament/football/israel/ligat-haal/266', { waitUntil: 'domcontentloaded', timeout: 60000 });
    // Wait through Cloudflare if needed.
    const start = Date.now();
    while (Date.now() - start < 60000) {
      const title = await page.title().catch(() => '');
      if (!/just a moment|attention required|cloudflare/i.test(title)) break;
      await sleep(2000);
    }
    console.log('Page open. Title:', await page.title());

    let totalEvents = 0, totalRatings = 0, unmatchedGames = 0, unmatchedPlayers = 0;
    const rounds = SPECIFIC_ROUND ? [parseInt(SPECIFIC_ROUND, 10)] : Array.from({ length: 36 }, (_, i) => i + 1);

    for (const round of rounds) {
      const eventsUrl = `https://api.sofascore.com/api/v1/unique-tournament/266/season/${ssSeasonId}/events/round/${round}`;
      const eventsData = await pageFetchJson(page, eventsUrl);
      if (!eventsData?.events?.length) continue;
      console.log(`Round ${round}: ${eventsData.events.length} events`);

      for (const ev of eventsData.events) {
        if (LIMIT && totalEvents >= LIMIT) break;
        totalEvents++;
        const eventDate = new Date(ev.startTimestamp * 1000).toISOString();
        const gameId = matchGame(gameLookup, eventDate, ev.homeTeam?.name, ev.awayTeam?.name);
        if (!gameId) { unmatchedGames++; continue; }

        const lineupsUrl = `https://api.sofascore.com/api/v1/event/${ev.id}/lineups`;
        const lineups = await pageFetchJson(page, lineupsUrl);
        await sleep(300);
        if (!lineups) continue;

        for (const side of ['home', 'away']) {
          const arr = lineups[side]?.players || [];
          for (const sp of arr) {
            const rating = parseFloat(sp.statistics?.rating);
            if (!Number.isFinite(rating) || rating <= 0) continue;
            const playerId = playerLookup.get(normalizeName(sp.player?.name));
            if (!playerId) { unmatchedPlayers++; continue; }
            const value = Math.max(0, Math.min(10, rating));
            const existing = await prisma.playerMatchRating.findFirst({
              where: { gameId, playerId, source: 'sofascore' }, select: { id: true },
            });
            if (existing) {
              await prisma.playerMatchRating.update({ where: { id: existing.id }, data: { rating: value } });
            } else {
              await prisma.playerMatchRating.create({ data: { gameId, playerId, source: 'sofascore', rating: value } });
            }
            totalRatings++;
          }
        }
      }
      if (LIMIT && totalEvents >= LIMIT) break;
      await sleep(400);
    }

    console.log(`\nDone. events=${totalEvents}, ratings=${totalRatings}, unmatched-games=${unmatchedGames}, unmatched-players=${unmatchedPlayers}`);
  } finally {
    await browser.close();
    await prisma.$disconnect();
  }
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
