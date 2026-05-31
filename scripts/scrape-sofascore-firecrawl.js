/**
 * scrape-sofascore-firecrawl.js — pull per-player ratings from Sofascore
 * via Firecrawl (1 credit per match, free tier covers ~1000/month).
 *
 * Why Firecrawl: api.sofascore.com is IP-blocked from our server. The www.
 * site renders fine through Firecrawl's stealth browsers, and the markdown
 * output cleanly lists "rating, jersey#, name" triples we can parse.
 *
 * Usage:
 *   node scripts/scrape-sofascore-firecrawl.js --url <match-url> [--save]
 *   node scripts/scrape-sofascore-firecrawl.js --season 2025/26 [--limit N]
 *
 * Markdown shape we parse (per starter):
 *   <RATING>\n\n<JERSEY><NAME>
 *
 * Where RATING is like "7.5", JERSEY is 1-99 (no separator), NAME starts
 * with a letter and may include "(c)" captain marker.
 */
'use strict';
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const SINGLE_URL = arg('url', null);
const SEASON_LABEL = arg('season', null);
const TEAM_NAME = arg('team', null); // e.g. "Hapoel Beer Sheva"
const LIMIT = parseInt(arg('limit', '0'), 10);
const SAVE = process.argv.includes('--save');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const API_KEY = process.env.FIRECRAWL_API_KEY;

if (!API_KEY) { console.error('Missing FIRECRAWL_API_KEY env var'); process.exit(1); }

async function firecrawl(url) {
  const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url,
      formats: ['markdown'],
      waitFor: 5000,
      onlyMainContent: false,
    }),
  });
  const data = await res.json();
  if (!data?.success) { console.error('  firecrawl error:', data?.error); return null; }
  return data.data;
}

function normalizeName(s) {
  return (s || '').replace(/[.,'"`]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Parse the lineup section. The markdown has a structure like:
 *   <Home Team Name>
 *   ...
 *   <number>.<digit>          <- rating
 *   <jersey><name>            <- e.g. "55N. Eliasi"  or  "4(c) M. Vítor"
 *   <number>.<digit>
 *   <jersey><name>
 *   ...
 *   <Away Team Name>
 *   ...
 *
 * Returns: [{ name, rating, team: 'home'|'away' }]
 */
function parseLineupRatings(md) {
  // Strategy: walk the markdown line-by-line, looking for the formation
  // pattern (e.g. "4-3-3") which uniquely marks each team's header block.
  // First formation → home side starts. Second formation → away side starts.
  // Between formations: collect (rating, jersey+name) pairs.
  const lines = md.split('\n').map((l) => l.trim());
  const ratings = [];
  let side = null; // 'home' | 'away' | null
  let formationsSeen = 0;

  // Player rating: "X.Y" or "XX.Y" — single digit after the decimal.
  const PLAYER_RATING = /^(\d{1,2}\.\d)$/;
  // Team rating: "X.YZ" — two digits after the decimal.
  const TEAM_RATING = /^\d{1,2}\.\d{2}$/;
  // Formation: e.g. "4-3-3", "4-2-3-1", "3-5-2".
  const FORMATION = /^\d(?:-\d){2,3}$/;
  // Player row: leading jersey (1-3 digits, may include "(c)") then name.
  const PLAYER_LINE = /^(\d{1,3})(.+)$/;

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l) continue;

    if (FORMATION.test(l)) {
      formationsSeen++;
      side = formationsSeen === 1 ? 'home' : formationsSeen === 2 ? 'away' : side;
      continue;
    }
    if (!side) continue;
    if (TEAM_RATING.test(l)) continue; // team aggregate — skip
    const m = l.match(PLAYER_RATING);
    if (!m) continue;
    const rating = parseFloat(m[1]);
    if (!(rating >= 0 && rating <= 10)) continue;

    // Find the player line right after — skip blank lines + image links.
    let j = i + 1;
    while (j < lines.length && (lines[j] === '' || lines[j].startsWith('!['))) j++;
    if (j >= lines.length) continue;
    const pm = lines[j].match(PLAYER_LINE);
    if (!pm) continue;
    const name = pm[2].replace(/\(c\)\s*/i, '').trim();
    if (name.length < 2) continue;
    ratings.push({ name, rating, side });
    i = j;
  }
  return ratings;
}

async function processMatch(matchUrl, options = {}) {
  console.log(`→ ${matchUrl}`);
  const data = await firecrawl(matchUrl);
  if (!data?.markdown) { console.log('  no markdown'); return null; }

  // Read team names from page title for game-matching purposes.
  const title = data.metadata?.title || '';
  const teamsMatch = title.match(/^(.+?)\s+vs\s+(.+?)\s+(live\s+score|h2h|lineups)/i);
  const homeTeamName = teamsMatch?.[1]?.trim() || '';
  const awayTeamName = teamsMatch?.[2]?.trim() || '';

  const ratings = parseLineupRatings(data.markdown);
  // Sofascore's markdown sometimes lists away players before the away team
  // header, so we can't trust `side` from the parser. Resolve team membership
  // by looking up each player in the DB.
  console.log(`  ${homeTeamName} vs ${awayTeamName} — ${ratings.length} ratings parsed`);
  if (!options.save) return { matchUrl, ratings, homeTeamName, awayTeamName };

  // Match to local game + players.
  if (!options.gameId) {
    console.log('  no local gameId provided; skipping save');
    return { matchUrl, ratings };
  }
  const playerLookup = options.playerLookup;
  let saved = 0;
  let unmatched = 0;
  for (const r of ratings) {
    const playerId = playerLookup.get(normalizeName(r.name));
    if (!playerId) { unmatched++; continue; }
    const existing = await prisma.playerMatchRating.findFirst({
      where: { gameId: options.gameId, playerId, source: 'sofascore' },
      select: { id: true },
    });
    const value = Math.max(0, Math.min(10, r.rating));
    if (existing) {
      await prisma.playerMatchRating.update({ where: { id: existing.id }, data: { rating: value } });
    } else {
      await prisma.playerMatchRating.create({
        data: { gameId: options.gameId, playerId, source: 'sofascore', rating: value },
      });
    }
    saved++;
  }
  console.log(`  saved ${saved}, unmatched ${unmatched}`);
  return { matchUrl, saved, unmatched };
}

async function loadPlayerLookup(seasonId) {
  const players = await prisma.player.findMany({
    where: { team: { seasonId } },
    select: { id: true, nameHe: true, nameEn: true },
  });
  const lookup = new Map();
  for (const p of players) {
    for (const k of [p.nameHe, p.nameEn].filter(Boolean).map(normalizeName)) {
      if (!lookup.has(k)) lookup.set(k, p.id);
    }
  }
  console.log(`Loaded ${players.length} players (${lookup.size} keys).`);
  return lookup;
}

async function discoverHbsUrls() {
  console.log('Discovering HBS match URLs via Firecrawl…');
  const seedUrls = [
    'https://www.sofascore.com/team/football/hapoel-beer-sheva/5202',
    'https://www.sofascore.com/tournament/football/israel/ligat-haal/266',
  ];
  const all = new Set();
  for (const u of seedUrls) {
    const d = await firecrawl(u);
    const md = d?.markdown || '';
    const found = md.match(/https:\/\/www\.sofascore\.com\/football\/match\/[a-z0-9-]+\/[A-Za-z0-9]+/g) || [];
    for (const m of found) if (m.includes('beer-sheva')) all.add(m);
  }
  return Array.from(all);
}

async function saveRatings(gameId, ratings, playerLookup) {
  let saved = 0, unmatched = 0;
  for (const r of ratings) {
    const playerId = playerLookup.get(normalizeName(r.name));
    if (!playerId) { unmatched++; console.log(`    skip: ${r.name} (no DB match)`); continue; }
    const existing = await prisma.playerMatchRating.findFirst({
      where: { gameId, playerId, source: 'sofascore' }, select: { id: true },
    });
    const value = Math.max(0, Math.min(10, r.rating));
    if (existing) {
      await prisma.playerMatchRating.update({ where: { id: existing.id }, data: { rating: value } });
    } else {
      await prisma.playerMatchRating.create({
        data: { gameId, playerId, source: 'sofascore', rating: value },
      });
    }
    saved++;
  }
  return { saved, unmatched };
}

async function loadPlayerLookupAllRecent() {
  // For HBS games: pull players from BOTH HBS and any opponent in the season.
  const recent = await prisma.player.findMany({
    where: { team: { season: { year: { gte: 2024 } } } },
    select: { id: true, nameHe: true, nameEn: true },
  });
  const lookup = new Map();
  for (const p of recent) {
    for (const k of [p.nameHe, p.nameEn].filter(Boolean).map(normalizeName)) {
      if (!lookup.has(k)) lookup.set(k, p.id);
    }
  }
  console.log(`Loaded ${recent.length} players (${lookup.size} unique name keys).`);
  return lookup;
}

async function findGameByTeams(homeName, awayName) {
  // Match Sofascore's English team names (e.g., "Hapoel Be'er Sheva") to our
  // local games by trying several name fragments. Returns the most recent
  // matching completed game.
  function trim(s) { return s.replace(/'/g, '').toLowerCase().trim(); }
  const homeKey = trim(homeName);
  const awayKey = trim(awayName);
  const games = await prisma.game.findMany({
    where: { status: 'COMPLETED' },
    include: { homeTeam: { select: { nameHe: true, nameEn: true } }, awayTeam: { select: { nameHe: true, nameEn: true } } },
    orderBy: { dateTime: 'desc' },
    take: 200,
  });
  return games.find((g) => {
    const hh = trim(g.homeTeam.nameEn || ''), ha = trim(g.awayTeam.nameEn || '');
    return (hh.includes(homeKey.slice(0, 10)) || homeKey.includes(hh.slice(0, 10)))
        && (ha.includes(awayKey.slice(0, 10)) || awayKey.includes(ha.slice(0, 10)));
  }) || null;
}

async function main() {
  if (SINGLE_URL) {
    const result = await processMatch(SINGLE_URL, { save: false });
    if (result?.ratings) {
      console.log('\nPlayers + ratings:');
      for (const r of result.ratings) console.log(`  ${r.rating} — ${r.name}`);
    }
    await prisma.$disconnect();
    return;
  }

  if (TEAM_NAME && TEAM_NAME.toLowerCase().includes('beer sheva')) {
    const urls = await discoverHbsUrls();
    console.log(`\nWill process ${urls.length} HBS matches.`);
    const playerLookup = await loadPlayerLookupAllRecent();
    let totalSaved = 0, totalUnmatched = 0, totalMatched = 0;
    const cap = LIMIT > 0 ? Math.min(LIMIT, urls.length) : urls.length;
    for (let i = 0; i < cap; i++) {
      const url = urls[i];
      const result = await processMatch(url);
      if (!result?.ratings?.length) continue;
      const game = await findGameByTeams(result.homeTeamName, result.awayTeamName);
      if (!game) { console.log(`  no DB game found for ${result.homeTeamName} vs ${result.awayTeamName}`); continue; }
      console.log(`  → DB game ${game.id} (${game.dateTime.toISOString().slice(0,10)})`);
      const { saved, unmatched } = await saveRatings(game.id, result.ratings, playerLookup);
      totalSaved += saved;
      totalUnmatched += unmatched;
      totalMatched++;
    }
    console.log(`\nDONE — matches: ${totalMatched}, ratings saved: ${totalSaved}, unmatched names: ${totalUnmatched}`);
    await prisma.$disconnect();
    return;
  }

  console.error('Pass either --url <match-url> or --team "Hapoel Beer Sheva".');
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
