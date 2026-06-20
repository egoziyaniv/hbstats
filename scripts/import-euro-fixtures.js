/**
 * Import ONLY Israeli clubs' European fixtures (CL/Europa/Conference) from
 * API-Football into the DB — without dumping the whole competition's ~170
 * foreign clubs. For each fixture that involves an Israeli league club we create
 * the season, the competition, the two teams' season rows (reusing an Israeli
 * club's canonical Hebrew name when we already have it), and the game.
 *
 * Idempotent: games upsert by apiFootballId, teams by (apiFootballId, seasonId).
 * Dry-run by default; pass --execute to write.  Self-loads .env.
 *
 *   node scripts/import-euro-fixtures.js [--season 2026] [--execute]
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

const EURO = {
  2: { nameEn: 'UEFA Champions League', nameHe: 'ליגת האלופות' },
  3: { nameEn: 'UEFA Europa League', nameHe: 'הליגה האירופית' },
  848: { nameEn: 'UEFA Europa Conference League', nameHe: 'קונפרנס ליג' },
};

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

async function main() {
  const execute = process.argv.includes('--execute');
  const seasonYear = Number(arg('--season')) || 2026;
  const seasonName = `${seasonYear}/${String(seasonYear + 1).slice(2)}`; // house style: "2026/27"
  console.log(`Mode: ${execute ? 'EXECUTE' : 'DRY-RUN'} | season ${seasonName}\n`);

  // Israeli league clubs by apiFootballId (+ a canonical nameHe cache).
  const israeli = await prisma.team.findMany({
    where: { apiFootballId: { not: null }, standings: { some: { competition: { apiFootballId: { in: [382, 383] } } } } },
    select: { apiFootballId: true, nameHe: true, nameEn: true }, distinct: ['apiFootballId'],
  });
  const israeliIds = new Set(israeli.map((t) => t.apiFootballId));
  const nameHeByApiId = new Map(israeli.map((t) => [t.apiFootballId, t.nameHe]));

  // Collect Israeli fixtures across the three European competitions.
  const fixtures = [];
  for (const lid of Object.keys(EURO)) {
    const d = await api(`/fixtures?league=${lid}&season=${seasonYear}`);
    for (const f of d.response || []) {
      if (israeliIds.has(f.teams.home.id) || israeliIds.has(f.teams.away.id)) fixtures.push({ lid: Number(lid), f });
    }
  }
  console.log(`Found ${fixtures.length} Israeli European fixture(s) in the API.`);
  if (fixtures.length === 0) { await prisma.$disconnect(); return; }
  for (const { lid, f } of fixtures) {
    console.log(`   ${EURO[lid].nameHe} · ${f.fixture.date.slice(0, 16)} · ${f.teams.home.name} vs ${f.teams.away.name} [${f.fixture.status.short}]`);
  }
  if (!execute) { console.log('\n(dry-run — nothing written; re-run with --execute)'); await prisma.$disconnect(); return; }

  // season
  let season = await prisma.season.findFirst({ where: { year: seasonYear } });
  if (!season) {
    season = await prisma.season.create({ data: { year: seasonYear, name: seasonName, startDate: new Date(`${seasonYear}-08-01`), endDate: new Date(`${seasonYear + 1}-06-30`) } });
    console.log(`+ created season ${seasonName}`);
  }

  const compCache = new Map();
  async function ensureComp(lid) {
    if (compCache.has(lid)) return compCache.get(lid);
    const meta = EURO[lid];
    const comp = await prisma.competition.upsert({
      where: { apiFootballId: lid },
      update: {},
      create: { apiFootballId: lid, nameEn: meta.nameEn, nameHe: meta.nameHe, type: 'CUP' },
    });
    await prisma.competitionSeason.upsert({
      where: { competitionId_seasonId: { competitionId: comp.id, seasonId: season.id } },
      update: {}, create: { competitionId: comp.id, seasonId: season.id },
    }).catch(() => null);
    compCache.set(lid, comp);
    return comp;
  }

  async function ensureTeam(apiTeam) {
    const nameHe = nameHeByApiId.get(apiTeam.id) || apiTeam.name; // foreign clubs: use API name
    const existing = await prisma.team.findFirst({ where: { apiFootballId: apiTeam.id, seasonId: season.id } });
    if (existing) return existing;
    return prisma.team.create({
      data: { apiFootballId: apiTeam.id, seasonId: season.id, nameEn: apiTeam.name, nameHe, logoUrl: apiTeam.logo || null },
    });
  }

  let created = 0, updated = 0;
  for (const { lid, f } of fixtures) {
    const comp = await ensureComp(lid);
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
