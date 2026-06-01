/**
 * scrape-sofascore-match-stats.js — pull per-match team-level statistics
 * from Sofascore's "Statistics" tab (Firecrawl, ~3 credits per match for
 * the click+scrape action). Produces ~40 metrics per match across the
 * sections: Shots, Attack, Passes, Duels, Defending, Goalkeeping.
 *
 * Usage:
 *   node scripts/scrape-sofascore-match-stats.js --url <match-url>
 *   node scripts/scrape-sofascore-match-stats.js --season 2025/26 [--limit N] [--competition <id>]
 */
'use strict';
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const SINGLE_URL = arg('url', null);
const LIMIT = parseInt(arg('limit', '0'), 10);
const COMPETITION_ID = arg('competition', null);
const API_KEY = process.env.FIRECRAWL_API_KEY;
if (!API_KEY) { console.error('Missing FIRECRAWL_API_KEY'); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function firecrawl(url, attempt = 1) {
  try {
    const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url, formats: ['markdown'], waitFor: 6000, onlyMainContent: false,
        actions: [
          { type: 'click', selector: 'a[href*="tab:statistics"], button:has-text("Statistics")' },
          { type: 'wait', milliseconds: 3000 },
        ],
      }),
    });
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch {
      console.error(`  non-JSON (HTTP ${res.status}): ${text.slice(0, 60)}`);
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

// Known Sofascore statistics-tab labels. The parser walks the markdown looking
// for `<home> <label> <away>` triples where home/away may include "/" or "%".
// Order matters for display grouping; anything we miss falls into "other".
const SECTIONS = {
  'Shots': [
    'Total shots', 'Shots on target', 'Hit woodwork', 'Shots off target',
    'Blocked shots', 'Shots inside box', 'Shots outside box',
  ],
  'Attack': [
    'Big chances scored', 'Big chances missed', 'Touches in opposition box',
    'Fouled in final third', 'Offsides', 'Corners',
  ],
  'Passes': [
    'Accurate passes', 'Throw-ins', 'Final third entries',
    'Passes in final third', 'Long balls', 'Crosses',
  ],
  'Duels': [
    'Duels', 'Dispossessed', 'Ground duels', 'Aerial duels', 'Dribbles',
  ],
  'Defending': [
    'Total tackles', 'Tackles won', 'Interceptions', 'Recoveries',
    'Clearances', 'Errors leading to goal',
  ],
  'Goalkeeping': [
    'Goalkeeper saves', 'Big saves', 'High claims', 'Goal kicks',
  ],
};

// Value token regex — matches one of:
//   "12" / "12.3" / "46%" / "34/74" / "34/74 46%" (compound: count + percent)
const VALUE = String.raw`\d+(?:[./]\d+)*%?`;
const VALUE_PAIR = String.raw`(${VALUE})(?:\s+(${VALUE}))?`;

function parseMatchStats(md) {
  const stats = [];
  const seen = new Set();

  for (const [section, labels] of Object.entries(SECTIONS)) {
    for (const label of labels) {
      // Build "<home-tokens> <label> <away-tokens>" matcher. Allow the
      // home/away parts to include either a single number OR "count percent".
      const re = new RegExp(
        `(?:^|\\n|\\s)${VALUE_PAIR}\\s+` +
        label.replace(/[.()-]/g, (c) => `\\${c}`) +
        `\\s+${VALUE_PAIR}(?=\\s|$|\\n)`,
        'gm'
      );
      const m = re.exec(md);
      if (!m) continue;
      if (seen.has(label)) continue;
      seen.add(label);
      const [, home1, home2, away1, away2] = m;
      stats.push({
        section, label,
        home: home1,
        away: away1,
        homeExtra: home2 || null,
        awayExtra: away2 || null,
      });
    }
  }
  return stats;
}

async function findGameByTeams(homeName, awayName) {
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

async function findTeamUrl(teamNameEn) {
  const res = await fetch('https://api.firecrawl.dev/v1/search', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: `site:sofascore.com football/team ${teamNameEn}`, limit: 5 }),
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { return null; }
  const results = data?.data || [];
  for (const r of results) {
    if (!r.url) continue;
    const m = r.url.match(/sofascore\.com\/football\/team\/([a-z0-9-]+)\/(\d+)\b/);
    if (!m) continue;
    if (m[1].match(/u\d+|junior|youth|reserve/i)) continue;
    return r.url;
  }
  return null;
}

async function discoverMatchUrls() {
  // Mirror the ratings scraper: pick all current-season Ligat HaAl teams,
  // look up their Sofascore team URLs, scrape each team page for match URLs.
  const teams = await prisma.team.findMany({
    where: { season: { year: 2025 }, standings: { some: { competitionId: 'comp_liga_haal' } } },
    select: { nameEn: true },
  });
  console.log(`\nDiscovering match URLs via ${teams.length} team pages…`);
  const matchUrls = new Set();
  for (const team of teams) {
    const url = await findTeamUrl(team.nameEn);
    if (!url) { console.log(`  ✗ ${team.nameEn}`); continue; }
    const d = await firecrawl(url);
    const md = d?.markdown || '';
    const found = md.match(/https:\/\/www\.sofascore\.com\/football\/match\/[a-z0-9-]+\/[A-Za-z0-9]+/g) || [];
    let added = 0;
    for (const m of found) { if (!matchUrls.has(m)) { matchUrls.add(m); added++; } }
    console.log(`  ✓ ${team.nameEn}: +${added} (total ${matchUrls.size})`);
    await sleep(300);
  }
  return Array.from(matchUrls);
}

async function processMatchUrl(matchUrl) {
  console.log(`→ ${matchUrl}`);
  const data = await firecrawl(matchUrl);
  if (!data?.markdown) { console.log('  no markdown'); return null; }

  const title = data.metadata?.title || '';
  const teamsMatch = title.match(/^(.+?)\s+vs\s+(.+?)\s+(live\s+score|h2h|lineups|statistics)/i);
  const homeTeamName = teamsMatch?.[1]?.trim() || '';
  const awayTeamName = teamsMatch?.[2]?.trim() || '';
  console.log(`  ${homeTeamName} vs ${awayTeamName}`);

  const stats = parseMatchStats(data.markdown);
  console.log(`  parsed ${stats.length} stats`);
  if (stats.length < 5) {
    console.log('  · sparse data — statistics tab probably did not render');
    return null;
  }

  const game = await findGameByTeams(homeTeamName, awayTeamName);
  if (!game) { console.log('  no DB game found'); return null; }
  if (COMPETITION_ID && game.competitionId !== COMPETITION_ID) {
    console.log(`  skip: competition=${game.competitionId} (wanted ${COMPETITION_ID})`);
    return null;
  }

  // Upsert by gameId (unique).
  await prisma.sofascoreMatchStats.upsert({
    where: { gameId: game.id },
    create: { gameId: game.id, payload: stats, matchUrl, scrapedAt: new Date() },
    update: { payload: stats, matchUrl, scrapedAt: new Date() },
  });
  console.log(`  ✓ saved ${stats.length} stats → game ${game.id} (${game.dateTime.toISOString().slice(0,10)})`);
  return { gameId: game.id, count: stats.length };
}

async function main() {
  if (SINGLE_URL) {
    await processMatchUrl(SINGLE_URL);
    await prisma.$disconnect();
    return;
  }

  const urls = await discoverMatchUrls();
  console.log(`\nProcessing ${urls.length} match URLs…`);
  const cap = LIMIT > 0 ? Math.min(LIMIT, urls.length) : urls.length;
  let saved = 0, skipped = 0;
  for (let i = 0; i < cap; i++) {
    const res = await processMatchUrl(urls[i]);
    if (res) saved++; else skipped++;
    await sleep(500);
  }
  console.log(`\nDONE — saved: ${saved}, skipped: ${skipped}`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
