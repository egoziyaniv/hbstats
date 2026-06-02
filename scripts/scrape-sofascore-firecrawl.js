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
// Optional competitionId filter (e.g. "comp_liga_haal", "comp_state_cup").
// When set, ratings are only saved for games whose competitionId matches.
const COMPETITION_ID = arg('competition', null);
// Optional date filter — when set, only games whose dateTime falls on this
// calendar day are processed. Used by matchday-update.js to scope a daily run.
const DATE_FILTER = arg('date', null); // YYYY-MM-DD
const SAVE = process.argv.includes('--save');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const API_KEY = process.env.FIRECRAWL_API_KEY;

if (!API_KEY) { console.error('Missing FIRECRAWL_API_KEY env var'); process.exit(1); }

async function firecrawl(url, attempt = 1) {
  try {
    const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, formats: ['markdown'], waitFor: 5000, onlyMainContent: false }),
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch {
      // Firecrawl sometimes returns a plain "Bad Gateway" 502 page. Retry once.
      console.error(`  firecrawl non-JSON (HTTP ${res.status}): ${text.slice(0, 60)}`);
      if (attempt < 2) { await sleep(2000); return firecrawl(url, attempt + 1); }
      return null;
    }
    if (!data?.success) { console.error('  firecrawl error:', data?.error); return null; }
    return data.data;
  } catch (e) {
    console.error('  firecrawl exception:', e.message);
    if (attempt < 2) { await sleep(2000); return firecrawl(url, attempt + 1); }
    return null;
  }
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

// Find the two head-coach links in the match markdown and attribute them to
// home/away based on which team name appears closer upstream in the document.
// Falls back to source order (first link = home) when neither team name is
// found nearby. Returns { home: string|null, away: string|null }.
function parseManagers(md, homeTeamName, awayTeamName) {
  const re = /\[([^\]\n]{3,80})\]\(([^)]*\/football\/manager\/[^)]+)\)/gi;
  const matches = [];
  let m;
  while ((m = re.exec(md)) !== null) {
    let name = m[1].replace(/^(manager|coach|head\s*coach)\s*[:\-]?\s*/i, '').trim();
    if (name.length < 3) continue;
    matches.push({ name, index: m.index });
  }
  if (matches.length === 0) return { home: null, away: null };
  // Helper: nearest team name upstream from an index (search last 2000 chars).
  function nearestTeam(idx) {
    const window = md.slice(Math.max(0, idx - 2000), idx);
    const hHome = homeTeamName ? window.lastIndexOf(homeTeamName) : -1;
    const hAway = awayTeamName ? window.lastIndexOf(awayTeamName) : -1;
    if (hHome === -1 && hAway === -1) return null;
    return hHome > hAway ? 'home' : 'away';
  }
  const out = { home: null, away: null };
  for (const cand of matches) {
    const side = nearestTeam(cand.index);
    if (side && !out[side]) out[side] = cand.name;
  }
  // Fill remaining slot from any unused match (preserves order).
  if (!out.home || !out.away) {
    const used = new Set(Object.values(out).filter(Boolean));
    const leftover = matches.find((c) => !used.has(c.name));
    if (leftover) {
      if (!out.home) out.home = leftover.name;
      else if (!out.away) out.away = leftover.name;
    }
  }
  return out;
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

  const managers = parseManagers(data.markdown, homeTeamName, awayTeamName);
  if (managers.home || managers.away) {
    console.log(`  managers: ${managers.home || '?'} (home) · ${managers.away || '?'} (away)`);
  }
  const ratings = parseLineupRatings(data.markdown);
  // Sofascore's markdown sometimes lists away players before the away team
  // header, so we can't trust `side` from the parser. Resolve team membership
  // by looking up each player in the DB.
  console.log(`  ${homeTeamName} vs ${awayTeamName} — ${ratings.length} ratings parsed`);
  if (!options.save) return { matchUrl, ratings, homeTeamName, awayTeamName, managers };

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

async function firecrawlSearch(query, limit = 3, attempt = 1) {
  try {
    const res = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, limit }),
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch {
      console.error(`  search non-JSON (HTTP ${res.status}): ${text.slice(0, 60)}`);
      if (attempt < 2) { await sleep(2000); return firecrawlSearch(query, limit, attempt + 1); }
      return [];
    }
    return data?.data || [];
  } catch (e) {
    console.error('  search exception:', e.message);
    if (attempt < 2) { await sleep(2000); return firecrawlSearch(query, limit, attempt + 1); }
    return [];
  }
}

async function findSofascoreTeamUrl(teamNameEn) {
  // Use Firecrawl web search to discover the Sofascore team URL. Sofascore's
  // team URLs follow /football/team/{slug}/{id}. We pick the FIRST result
  // that matches the expected pattern AND has the team name in its title.
  const results = await firecrawlSearch(`site:sofascore.com football/team ${teamNameEn}`, 5);
  for (const r of results) {
    if (!r.url) continue;
    const m = r.url.match(/sofascore\.com\/football\/team\/([a-z0-9-]+)\/(\d+)\b/);
    if (!m) continue;
    // Skip youth/U19/U21 etc.
    if (m[1].match(/u\d+|junior|youth|reserve/i)) continue;
    return r.url;
  }
  return null;
}

async function discoverAllLeagueMatches(teamNamesEn) {
  console.log(`\nDiscovering Sofascore URLs for ${teamNamesEn.length} teams…`);
  const teamUrls = [];
  for (const name of teamNamesEn) {
    const url = await findSofascoreTeamUrl(name);
    if (url) {
      console.log(`  ✓ ${name} → ${url}`);
      teamUrls.push(url);
    } else {
      console.log(`  ✗ ${name} (not found)`);
    }
    await sleep(300);
  }

  console.log(`\nScraping ${teamUrls.length} team pages for match URLs…`);
  const matchUrls = new Set();
  for (const teamUrl of teamUrls) {
    const d = await firecrawl(teamUrl);
    const md = d?.markdown || '';
    const found = md.match(/https:\/\/www\.sofascore\.com\/football\/match\/[a-z0-9-]+\/[A-Za-z0-9]+/g) || [];
    for (const m of found) matchUrls.add(m);
    await sleep(300);
  }
  console.log(`Total unique match URLs: ${matchUrls.size}`);
  return Array.from(matchUrls);
}

function lastnameOf(name) {
  const parts = name.replace(/[.,()'"]/g, ' ').replace(/\s+/g, ' ').trim().split(' ');
  return parts.length > 0 ? parts[parts.length - 1].toLowerCase() : '';
}

async function buildGamePlayerIndex(game) {
  // Pull all players for both teams in the game (current season + any
  // linked canonical/season records). Build name-lookup maps:
  //   byNorm: full-normalized-name → playerId
  //   byLastname: lastname → [playerIds]
  const players = await prisma.player.findMany({
    where: { teamId: { in: [game.homeTeamId, game.awayTeamId] } },
    select: { id: true, nameHe: true, nameEn: true },
  });
  const byNorm = new Map();
  const byLast = new Map();
  for (const p of players) {
    for (const k of [p.nameHe, p.nameEn].filter(Boolean).map(normalizeName)) {
      if (!byNorm.has(k)) byNorm.set(k, p.id);
    }
    for (const n of [p.nameEn, p.nameHe].filter(Boolean)) {
      const ln = lastnameOf(n);
      if (!ln) continue;
      if (!byLast.has(ln)) byLast.set(ln, []);
      const arr = byLast.get(ln);
      if (!arr.includes(p.id)) arr.push(p.id);
    }
  }
  return { byNorm, byLast, count: players.length };
}

// Look up an existing Coach record by name: direct match on nameEn/nameHe →
// CoachAlias exact match → fuzzy last-token contains. Returns null when no
// candidate looks plausible. Mirrors the logic from
// scrape-sofascore-coaches.js so per-match enrichment and per-team photo
// scraping converge on the same Coach row.
async function lookupCoachByName(name) {
  if (!name) return null;
  const direct = await prisma.coach.findFirst({
    where: { OR: [{ nameEn: { equals: name, mode: 'insensitive' } }, { nameHe: { equals: name, mode: 'insensitive' } }] },
    select: { id: true, nameEn: true },
  });
  if (direct) return direct;
  const alias = await prisma.coachAlias.findFirst({
    where: { alias: { equals: name, mode: 'insensitive' } },
    select: { coach: { select: { id: true, nameEn: true } } },
  });
  if (alias?.coach) return alias.coach;
  const tokens = name.replace(/[.,()'"]/g, ' ').replace(/\s+/g, ' ').trim().split(' ');
  const last = tokens[tokens.length - 1];
  if (last && last.length >= 4) {
    const fuzzy = await prisma.coach.findFirst({
      where: { nameEn: { contains: last, mode: 'insensitive' } },
      select: { id: true, nameEn: true },
    });
    if (fuzzy) return fuzzy;
  }
  return null;
}

// Save coach names as GameLineupEntry rows (role=COACH) and ensure a
// CoachAlias exists so the game page can light up the coach's photo +
// Hebrew name. Skips inserting an alias when one already exists for this
// (alias, coachId) so re-runs are no-ops.
async function saveManagers(game, managers) {
  let saved = 0;
  for (const side of ['home', 'away']) {
    const name = managers[side];
    if (!name) continue;
    const teamId = side === 'home' ? game.homeTeamId : game.awayTeamId;
    const existing = await prisma.gameLineupEntry.findFirst({
      where: { gameId: game.id, teamId, role: 'COACH' },
      select: { id: true, participantName: true },
    });
    if (existing) {
      if (!existing.participantName) {
        await prisma.gameLineupEntry.update({
          where: { id: existing.id },
          data: { participantName: name, participantType: 'COACH' },
        });
        saved++;
      }
    } else {
      await prisma.gameLineupEntry.create({
        data: { gameId: game.id, teamId, role: 'COACH', participantType: 'COACH', participantName: name },
      });
      saved++;
    }

    // Ensure a CoachAlias exists so enrichCoaches() can hydrate photo + Hebrew.
    const coach = await lookupCoachByName(name);
    if (coach) {
      const aliasExists = await prisma.coachAlias.findFirst({
        where: { alias: name, coachId: coach.id },
        select: { id: true },
      });
      if (!aliasExists) {
        try {
          await prisma.coachAlias.create({ data: { alias: name, coachId: coach.id } });
          console.log(`    + alias "${name}" → ${coach.nameEn}`);
        } catch {
          // Unique violation race — fine, another caller created it.
        }
      }
    } else {
      console.log(`    · no Coach found for "${name}" — coach will display name-only until added manually`);
    }
  }
  return saved;
}

async function saveRatings(game, ratings) {
  const { byNorm, byLast } = await buildGamePlayerIndex(game);
  let saved = 0, unmatched = 0;
  for (const r of ratings) {
    const normalised = normalizeName(r.name);
    let playerId = byNorm.get(normalised);
    if (!playerId) {
      // Fall back to lastname match — accept only when unique in this game.
      const candidates = byLast.get(lastnameOf(r.name)) || [];
      if (candidates.length === 1) playerId = candidates[0];
    }
    if (!playerId) { unmatched++; console.log(`    skip: ${r.name} (no DB match)`); continue; }
    const existing = await prisma.playerMatchRating.findFirst({
      where: { gameId: game.id, playerId, source: 'sofascore' }, select: { id: true },
    });
    const value = Math.max(0, Math.min(10, r.rating));
    if (existing) {
      await prisma.playerMatchRating.update({ where: { id: existing.id }, data: { rating: value } });
    } else {
      await prisma.playerMatchRating.create({
        data: { gameId: game.id, playerId, source: 'sofascore', rating: value },
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
    select: {
      id: true, dateTime: true, competitionId: true, homeTeamId: true, awayTeamId: true,
      homeTeam: { select: { nameHe: true, nameEn: true } },
      awayTeam: { select: { nameHe: true, nameEn: true } },
    },
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

  if (TEAM_NAME && TEAM_NAME.toLowerCase().includes('all')) {
    // --team "all" — full league mode.
    const teams = await prisma.team.findMany({
      where: { season: { year: 2025 }, standings: { some: { competitionId: 'comp_liga_haal' } } },
      select: { nameEn: true },
    });
    const teamNames = teams.map((t) => t.nameEn).filter(Boolean);
    const urls = await discoverAllLeagueMatches(teamNames);
    console.log(`\nProcessing ${urls.length} matches…`);
    const playerLookup = await loadPlayerLookupAllRecent();
    let totalSaved = 0, totalUnmatched = 0, totalMatched = 0;
    const cap = LIMIT > 0 ? Math.min(LIMIT, urls.length) : urls.length;
    for (let i = 0; i < cap; i++) {
      const result = await processMatch(urls[i]);
      if (!result?.ratings?.length) continue;
      const game = await findGameByTeams(result.homeTeamName, result.awayTeamName);
      if (!game) { console.log(`  no DB game found for ${result.homeTeamName} vs ${result.awayTeamName}`); continue; }
      if (COMPETITION_ID && game.competitionId !== COMPETITION_ID) {
        console.log(`  skip: game ${game.id} competition=${game.competitionId} (wanted ${COMPETITION_ID})`);
        continue;
      }
      if (DATE_FILTER && game.dateTime.toISOString().slice(0, 10) !== DATE_FILTER) {
        continue;
      }
      console.log(`  → DB game ${game.id} (${game.dateTime.toISOString().slice(0,10)})`);
      const { saved, unmatched } = await saveRatings(game, result.ratings);
      if (result.managers) await saveManagers(game, result.managers);
      totalSaved += saved;
      totalUnmatched += unmatched;
      totalMatched++;
    }
    console.log(`\nDONE — matches: ${totalMatched}, ratings: ${totalSaved}, unmatched names: ${totalUnmatched}`);
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
      if (COMPETITION_ID && game.competitionId !== COMPETITION_ID) {
        console.log(`  skip: game ${game.id} competition=${game.competitionId} (wanted ${COMPETITION_ID})`);
        continue;
      }
      if (DATE_FILTER && game.dateTime.toISOString().slice(0, 10) !== DATE_FILTER) {
        continue;
      }
      console.log(`  → DB game ${game.id} (${game.dateTime.toISOString().slice(0,10)})`);
      const { saved, unmatched } = await saveRatings(game, result.ratings);
      if (result.managers) await saveManagers(game, result.managers);
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
