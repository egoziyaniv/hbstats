/**
 * Weekly watch for Israeli clubs' European fixtures (security/ops convenience).
 *
 * UEFA qualifier draws happen through the summer; API-Football only creates the
 * fixtures after each draw. This script checks the Champions League / Europa /
 * Conference for the current European season and reports any NEWLY-appeared
 * fixture involving an Israeli top-flight (or 2nd-tier) club — so you don't have
 * to poll manually.
 *
 * "Israeli club" = any team whose apiFootballId appears in our comp_liga_haal /
 * comp_liga_leumit standings (the stable set of Israeli league clubs).
 *
 * State is kept in ~/.euro-fixtures-seen.json so each run reports only what's
 * new. New findings are appended to ~/logs/euro-fixtures-watch.log AND printed
 * (so the cron line / MAILTO captures them). When an email provider is wired,
 * routing these to email is a one-line addition.
 *
 *   node scripts/watch-euro-fixtures.js [--season 2026]
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const EURO_LEAGUES = { 2: 'Champions League', 3: 'Europa League', 848: 'Conference League' };
const STATE_FILE = path.join(os.homedir(), '.euro-fixtures-seen.json');
const LOG_FILE = path.join(os.homedir(), 'logs', 'euro-fixtures-watch.log');

function arg(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function currentEuroSeason() {
  const now = new Date();
  // UEFA season starts mid-year; from June on, the qualifiers belong to the
  // season named by the current calendar year (e.g. June 2026 → season 2026).
  return now.getMonth() + 1 >= 6 ? now.getFullYear() : now.getFullYear() - 1;
}

async function apiFetch(pathStr) {
  const base = (process.env.API_FOOTBALL_BASE_URL || 'https://v3.football.api-sports.io').replace(/\/$/, '');
  const res = await fetch(`${base}${pathStr}`, { headers: { 'x-apisports-key': process.env.API_FOOTBALL_KEY || '' } });
  if (!res.ok) throw new Error(`API ${pathStr} → ${res.status}`);
  return res.json();
}

function loadState() {
  try { return new Set(JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))); } catch { return new Set(); }
}
function saveState(set) {
  fs.writeFileSync(STATE_FILE, JSON.stringify([...set]));
}
function log(line) {
  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
  fs.appendFileSync(LOG_FILE, line + '\n');
  console.log(line);
}

async function main() {
  if (!process.env.API_FOOTBALL_KEY) { console.error('API_FOOTBALL_KEY not set'); process.exit(1); }
  const season = Number(arg('--season')) || currentEuroSeason();

  // Israeli league clubs by apiFootballId.
  const israeliTeams = await prisma.team.findMany({
    where: {
      apiFootballId: { not: null },
      standings: { some: { competition: { apiFootballId: { in: [382, 383] } } } },
    },
    select: { apiFootballId: true, nameHe: true, nameEn: true },
    distinct: ['apiFootballId'],
  });
  const idToName = new Map(israeliTeams.map((t) => [t.apiFootballId, t.nameHe || t.nameEn]));
  const israeliIds = new Set(idToName.keys());

  const seen = loadState();
  const fresh = [];

  for (const [leagueId, leagueName] of Object.entries(EURO_LEAGUES)) {
    let data;
    try { data = await apiFetch(`/fixtures?league=${leagueId}&season=${season}`); }
    catch (e) { console.error(`skip league ${leagueId}: ${e.message}`); continue; }
    for (const f of data.response || []) {
      const h = f.teams?.home?.id, a = f.teams?.away?.id;
      if (!israeliIds.has(h) && !israeliIds.has(a)) continue;
      const fid = f.fixture?.id;
      if (seen.has(fid)) continue;
      seen.add(fid);
      const club = idToName.get(h) || idToName.get(a) || 'קבוצה ישראלית';
      fresh.push({
        club, leagueName,
        round: f.league?.round || '',
        date: (f.fixture?.date || '').slice(0, 16),
        home: f.teams?.home?.name, away: f.teams?.away?.name,
      });
    }
  }

  const stamp = new Date().toISOString();
  if (fresh.length === 0) {
    console.log(`[${stamp}] euro-watch (season ${season}): no new Israeli European fixtures.`);
  } else {
    log(`[${stamp}] 🆕 ${fresh.length} NEW Israeli European fixture(s), season ${season}:`);
    for (const x of fresh) {
      log(`   ${x.club} · ${x.leagueName} · ${x.round} · ${x.date} · ${x.home} vs ${x.away}`);
    }
    log('   → import in admin: משיכת נתונים → ' + [...new Set(fresh.map((x) => x.leagueName))].join(' / ') + `, season ${season}.`);
  }

  saveState(seen);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
