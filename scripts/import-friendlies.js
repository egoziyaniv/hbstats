/**
 * import-friendlies.js — import Israeli clubs' pre-season CLUB FRIENDLIES
 * (API-Football league 667 "Friendlies Clubs") into the DB.
 *
 * League 667 is worldwide (thousands of games), so we pull PER Israeli team
 * (by apiFootballId) and keep only their league-667 fixtures, creating the
 * opponent clubs (usually foreign) as needed. This mirrors import-euro-fixtures.js.
 *
 * Idempotent: games upsert by apiFootballId; teams by (apiFootballId, seasonId).
 * Dry-run by default; pass --execute to write. Self-loads .env.
 *
 *   node scripts/import-friendlies.js [--season 2026] [--execute]
 */
const fs = require('fs');
const path = require('path');
(function loadEnv() {
  try {
    for (const line of fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch {}
})();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const FRIENDLIES_LEAGUE_ID = 667;
const COMP_META = { nameEn: 'Club Friendlies', nameHe: 'משחקי הכנה' };

function mapGameStatus(s) {
  if (!s) return 'SCHEDULED';
  if (['FT', 'AET', 'PEN'].includes(s)) return 'COMPLETED';
  if (['1H', '2H', 'HT', 'ET', 'BT', 'LIVE'].includes(s)) return 'ONGOING';
  if (['CANC', 'ABD', 'AWD', 'WO'].includes(s)) return 'CANCELLED';
  return 'SCHEDULED';
}
const arg = (f) => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : undefined; };
async function api(p) {
  const b = (process.env.API_FOOTBALL_BASE_URL || 'https://v3.football.api-sports.io').replace(/\/$/, '');
  const r = await fetch(b + p, { headers: { 'x-apisports-key': process.env.API_FOOTBALL_KEY } });
  if (!r.ok) throw new Error(`API ${p} → ${r.status}`);
  return r.json();
}
function chunk(a, n) { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; }

async function main() {
  const execute = process.argv.includes('--execute');
  const seasonYear = Number(arg('--season')) || 2026;
  const seasonName = `${seasonYear}/${String(seasonYear + 1).slice(2)}`;
  console.log(`Mode: ${execute ? 'EXECUTE' : 'DRY-RUN'} | season ${seasonName} | league ${FRIENDLIES_LEAGUE_ID}\n`);

  // Israeli top-two-division clubs by apiFootballId (+ canonical Hebrew names).
  const israeli = await prisma.team.findMany({
    where: { apiFootballId: { not: null }, standings: { some: { competition: { apiFootballId: { in: [382, 383] } } } } },
    select: { apiFootballId: true, nameHe: true, nameEn: true }, distinct: ['apiFootballId'],
  });
  const israeliIds = new Set(israeli.map((t) => t.apiFootballId));
  const nameHeByApiId = new Map(israeli.map((t) => [t.apiFootballId, t.nameHe]));
  console.log(`Scanning ${israeli.length} Israeli clubs for friendlies…`);

  // Pull each Israeli club's fixtures for the season, keep only league 667.
  const byFixtureId = new Map();
  for (const t of israeli) {
    const d = await api(`/fixtures?team=${t.apiFootballId}&season=${seasonYear}`).catch(() => null);
    for (const f of d?.response || []) {
      if (f?.league?.id === FRIENDLIES_LEAGUE_ID && f?.fixture?.id != null) {
        byFixtureId.set(f.fixture.id, f); // dedupe (two Israeli clubs meeting counts once)
      }
    }
  }
  const fixtures = Array.from(byFixtureId.values()).sort((a, b) => a.fixture.date.localeCompare(b.fixture.date));
  console.log(`Found ${fixtures.length} Israeli friendly fixture(s).`);
  for (const f of fixtures) {
    console.log(`   ${f.fixture.date.slice(0, 16)} · ${f.teams.home.name} ${f.goals.home ?? '-'}-${f.goals.away ?? '-'} ${f.teams.away.name} [${f.fixture.status.short}]`);
  }
  if (fixtures.length === 0) { await prisma.$disconnect(); return; }
  if (!execute) { console.log('\n(dry-run — nothing written; re-run with --execute)'); await prisma.$disconnect(); return; }

  // season
  let season = await prisma.season.findFirst({ where: { year: seasonYear } });
  if (!season) {
    season = await prisma.season.create({ data: { year: seasonYear, name: seasonName, startDate: new Date(`${seasonYear}-07-01`), endDate: new Date(`${seasonYear + 1}-06-30`) } });
    console.log(`+ created season ${seasonName}`);
  }

  // competition (friendlies)
  const comp = await prisma.competition.upsert({
    where: { apiFootballId: FRIENDLIES_LEAGUE_ID },
    update: {},
    create: { apiFootballId: FRIENDLIES_LEAGUE_ID, nameEn: COMP_META.nameEn, nameHe: COMP_META.nameHe, type: 'CUP' },
  });
  await prisma.competitionSeason.upsert({
    where: { competitionId_seasonId: { competitionId: comp.id, seasonId: season.id } },
    update: {}, create: { competitionId: comp.id, seasonId: season.id },
  }).catch(() => null);

  async function ensureTeam(apiTeam) {
    const nameHe = nameHeByApiId.get(apiTeam.id) || apiTeam.name; // foreign clubs keep API name
    const existing = await prisma.team.findFirst({ where: { apiFootballId: apiTeam.id, seasonId: season.id } });
    if (existing) return existing;
    return prisma.team.create({
      data: { apiFootballId: apiTeam.id, seasonId: season.id, nameEn: apiTeam.name, nameHe, logoUrl: apiTeam.logo || null },
    });
  }

  let created = 0, updated = 0;
  for (const f of fixtures) {
    const home = await ensureTeam(f.teams.home);
    const away = await ensureTeam(f.teams.away);
    const data = {
      dateTime: new Date(f.fixture.date),
      status: mapGameStatus(f.fixture.status.short),
      seasonId: season.id, competitionId: comp.id,
      homeTeamId: home.id, awayTeamId: away.id,
      homeScore: f.goals.home, awayScore: f.goals.away,
      roundNameEn: f.league.round || null,
      venueNameEn: f.fixture.venue?.name || null,
      refereeEn: f.fixture.referee || null,
    };
    const existing = await prisma.game.findUnique({ where: { apiFootballId: f.fixture.id } });
    if (existing) { await prisma.game.update({ where: { id: existing.id }, data }); updated++; }
    else { await prisma.game.create({ data: { ...data, apiFootballId: f.fixture.id } }); created++; }
  }
  console.log(`\nDone. games created: ${created}, updated: ${updated}.`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
