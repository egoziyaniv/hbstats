/**
 * scrape-sofascore-team-stats.js — pull per-season aggregate stats for each
 * Ligat HaAl team from Sofascore (via Firecrawl) and store as SofascoreTeamStats.
 *
 * Markdown shape on the team's #tab:statistics:
 *   <category header>
 *   <label1><value1>
 *   <label2><value2>
 *   ...
 *
 * We parse loosely: any "<label>:?<value>" pair where label has known stats
 * vocabulary. Stored as a flat key→value JSON payload.
 *
 * Usage:
 *   node scripts/scrape-sofascore-team-stats.js [--limit N]
 */
'use strict';
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const LIMIT = parseInt(arg('limit', '0'), 10);
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
          { type: 'click', selector: 'a[href*="tab:statistics"]' },
          { type: 'wait', milliseconds: 2500 },
        ],
      }),
    });
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch {
      if (attempt < 2) { await sleep(2000); return firecrawl(url, attempt + 1); }
      return null;
    }
    if (!data?.success) return null;
    return data.data;
  } catch (e) {
    if (attempt < 2) { await sleep(2000); return firecrawl(url, attempt + 1); }
    return null;
  }
}

async function firecrawlSearch(query) {
  const res = await fetch('https://api.firecrawl.dev/v1/search', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, limit: 5 }),
  });
  const text = await res.text();
  try { return JSON.parse(text)?.data || []; } catch { return []; }
}

async function findTeamUrl(teamNameEn) {
  const results = await firecrawlSearch(`site:sofascore.com football/team ${teamNameEn}`);
  for (const r of results) {
    if (!r.url) continue;
    const m = r.url.match(/sofascore\.com\/football\/team\/([a-z0-9-]+)\/(\d+)\b/);
    if (!m) continue;
    if (m[1].match(/u\d+|junior|youth|reserve/i)) continue;
    return r.url;
  }
  return null;
}

// Known stat labels we care about (Sofascore's English labels).
// Order matters slightly for cleaner display; we ALSO keep anything else as
// raw `extra.` keys to avoid losing info.
const KNOWN_STATS = [
  'Sofascore Rating', 'Matches', 'Goals scored', 'Goals conceded', 'Assists',
  'Goals per game', 'Penalty goals', 'Free kick goals',
  'Goals from inside the box', 'Goals from outside the box',
  'Left-footed goals', 'Right-footed goals', 'Headed goals',
  'Big chances per game', 'Big chances missed per game',
  'Total shots per game', 'Shots on target per game', 'Shots off target per game',
  'Blocked shots per game', 'Succ. dribbles per game',
  'Corners per game', 'Free kicks per game', 'Hit woodwork', 'Counter attacks',
  'Ball possession', 'Accurate passes', 'Acc. own half', 'Acc. opposition half',
  'Acc. long balls', 'Acc. crosses',
  'Clean sheets', 'Goals conceded per game',
  'Tackles per game', 'Interceptions per game', 'Clearances per game',
  'Fouls per game', 'Yellow cards', 'Red cards', 'Offsides per game',
];

function parseTeamStats(md) {
  // The markdown lays out stats as a series of small labeled rows. Each line
  // is either a section header (e.g. "Attacking"), a label sticky-joined
  // with its value ("Goals per game2.2"), or noise. We use a regex that
  // pulls "<label><value>" pairs where value contains digits.
  const out = {};
  for (const label of KNOWN_STATS) {
    // Allow the value to include numbers + percent + slashes + parentheses.
    const re = new RegExp(label.replace(/\./g, '\\.') + '\\s*([\\d.,%/() ]+)');
    const m = md.match(re);
    if (!m) continue;
    out[label] = m[1].trim().replace(/\s+/g, ' ');
  }
  return out;
}

async function processTeam(team) {
  console.log(`\n• ${team.nameHe || team.nameEn}`);
  const teamUrl = await findTeamUrl(team.nameEn);
  if (!teamUrl) { console.log('  ✗ no Sofascore URL'); return null; }
  console.log(`  → ${teamUrl}`);

  const data = await firecrawl(teamUrl);
  if (!data?.markdown) { console.log('  ✗ no markdown'); return null; }
  const stats = parseTeamStats(data.markdown);
  const keys = Object.keys(stats);
  console.log(`  ✓ parsed ${keys.length} stats`);
  if (keys.length < 5) { console.log('  · sparse data, skipping save'); return null; }

  const existing = await prisma.sofascoreTeamStats.findUnique({
    where: { teamId_seasonId: { teamId: team.id, seasonId: team.seasonId } },
  });
  if (existing) {
    await prisma.sofascoreTeamStats.update({
      where: { id: existing.id },
      data: { payload: stats, scrapedAt: new Date() },
    });
  } else {
    await prisma.sofascoreTeamStats.create({
      data: { teamId: team.id, seasonId: team.seasonId, payload: stats },
    });
  }
  return { teamId: team.id, stats };
}

async function main() {
  const teams = await prisma.team.findMany({
    where: { season: { year: 2025 }, standings: { some: { competitionId: 'comp_liga_haal' } } },
    select: { id: true, nameHe: true, nameEn: true, seasonId: true },
  });
  console.log(`Found ${teams.length} Ligat HaAl teams for 2025/26.`);
  let processed = 0;
  for (const t of teams) {
    if (LIMIT && processed >= LIMIT) break;
    await processTeam(t);
    processed++;
    await sleep(500);
  }
  console.log(`\nDone. Processed ${processed} teams.`);
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
