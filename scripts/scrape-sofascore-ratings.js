/**
 * scrape-sofascore-ratings.js — Sofascore per-player ratings via
 * puppeteer-real-browser.
 *
 * Strategy: api.sofascore.com is blocked at Cloudflare for our server IP, but
 * www.sofascore.com renders fine and calls the API internally. We intercept
 * those XHR responses via `page.on('response')` to harvest the JSON we need.
 *
 * Flow:
 *   1. Open www.sofascore.com/tournament/.../266 — captures round/season ids.
 *   2. For each matchday URL, browse + collect the events response.
 *   3. For each event, navigate to the match page + collect the lineups response.
 *   4. Match players + games against our DB and upsert into PlayerMatchRating.
 *
 * Usage:
 *   node scripts/scrape-sofascore-ratings.js --season 2025/26
 *   node scripts/scrape-sofascore-ratings.js --season 2025/26 --limit 5
 */
'use strict';
const { PrismaClient } = require('@prisma/client');
const { connect } = require('puppeteer-real-browser');
const prisma = new PrismaClient();

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const SEASON_LABEL = arg('season', '2025/26');
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
    headless: !HEADFUL, turnstile: true, args: ['--lang=en-US,en'],
    customConfig: {}, connectOption: {}, disableXvfb: false,
  });

  // Capture every JSON response from api.sofascore.com so we don't need to
  // call it directly. Keyed by URL substring.
  const captured = new Map();
  page.on('response', async (resp) => {
    const url = resp.url();
    if (!url.includes('api.sofascore.com')) return;
    if (resp.status() !== 200) return;
    try {
      const text = await resp.text();
      const trimmed = text.trim();
      if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return;
      captured.set(url, JSON.parse(trimmed));
    } catch {/* ignore */}
  });

  try {
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto('https://www.sofascore.com/tournament/football/israel/ligat-haal/266', { waitUntil: 'networkidle2', timeout: 60000 });
    // Wait through Cloudflare if needed.
    const cfStart = Date.now();
    while (Date.now() - cfStart < 60000) {
      const title = await page.title().catch(() => '');
      if (!/just a moment|attention required|cloudflare/i.test(title)) break;
      await sleep(2000);
    }
    console.log('Page open:', await page.title());

    let totalEvents = 0, totalRatings = 0, unmatchedGames = 0, unmatchedPlayers = 0;

    // Walk every round in the season. For each, navigate to the schedule view
    // — the page calls /events/round/X internally, which we intercept.
    for (let round = 1; round <= 36; round++) {
      const before = captured.size;
      captured.clear();
      const roundUrl = `https://www.sofascore.com/tournament/football/israel/ligat-haal/266/season/${ssSeasonId}#round=${round}`;
      try {
        await page.goto(roundUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      } catch { continue; }
      await sleep(2000); // let lazy fetches settle

      // Find the events response for this round.
      let events = null;
      for (const [url, data] of captured) {
        if (url.includes(`/events/round/${round}`)) { events = data?.events; break; }
      }
      if (!events?.length) continue;
      console.log(`Round ${round}: ${events.length} events`);

      for (const ev of events) {
        if (LIMIT && totalEvents >= LIMIT) break;
        totalEvents++;
        const eventDate = new Date(ev.startTimestamp * 1000).toISOString();
        const gameId = matchGame(gameLookup, eventDate, ev.homeTeam?.name, ev.awayTeam?.name);
        if (!gameId) { unmatchedGames++; continue; }

        // Visit the match's lineups tab. URL pattern: /football/match/{slug}/{shortcode}/lineups#id:{eventId}
        const slug = ev.slug || `${ev.homeTeam?.slug || 'home'}-${ev.awayTeam?.slug || 'away'}`;
        const matchUrl = `https://www.sofascore.com/event/${ev.id}/lineups`;
        captured.clear();
        try {
          await page.goto(matchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        } catch { continue; }
        await sleep(2000);

        let lineups = null;
        for (const [url, data] of captured) {
          if (url.endsWith(`/event/${ev.id}/lineups`) || url.includes(`/event/${ev.id}/lineups`)) { lineups = data; break; }
        }
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
    }

    console.log(`\nDone. events=${totalEvents}, ratings=${totalRatings}, unmatched-games=${unmatchedGames}, unmatched-players=${unmatchedPlayers}`);
  } finally {
    await browser.close();
    await prisma.$disconnect();
  }
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
