/**
 * Import Israeli preseason/cup fixtures from API-Football into the DB:
 *   - Super Cup / אלוף האלופים           (API-Football league 659 → comp_super_cup)
 *   - Toto Cup Ligat Ha'al / גביע הטוטו  (API-Football league 385 → comp_toto_cup_al)
 *
 * Unlike the European importer, EVERY fixture here is between Israeli clubs, so
 * there's no Israeli-only filter — we import them all. Teams are reused by
 * (apiFootballId, seasonId); their canonical Hebrew name is borrowed from an
 * existing league row when we already have it.
 *
 * Idempotent: games upsert by apiFootballId. Dry-run by default; --execute writes.
 * Self-loads .env.
 *
 *   node scripts/import-israeli-cups.js [--season 2026] [--execute]
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

// API-Football league id → our existing competition (matched by apiFootballId).
const CUPS = {
  659: { nameEn: 'Super Cup', nameHe: 'אלוף האלופים' },
  385: { nameEn: 'Toto Cup Ligat Al', nameHe: 'גביע הטוטו ליגת העל' },
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
  const seasonName = `${seasonYear}/${String(seasonYear + 1).slice(2)}`;
  console.log(`Mode: ${execute ? 'EXECUTE' : 'DRY-RUN'} | season ${seasonName}\n`);

  // Canonical Hebrew names for Israeli clubs we already track (league rows).
  const israeli = await prisma.team.findMany({
    where: { apiFootballId: { not: null }, standings: { some: { competition: { apiFootballId: { in: [382, 383] } } } } },
    select: { apiFootballId: true, nameHe: true }, distinct: ['apiFootballId'],
  });
  const nameHeByApiId = new Map(israeli.map((t) => [t.apiFootballId, t.nameHe]));

  const fixtures = [];
  for (const lid of Object.keys(CUPS)) {
    const d = await api(`/fixtures?league=${lid}&season=${seasonYear}`);
    for (const f of d.response || []) fixtures.push({ lid: Number(lid), f });
  }
  fixtures.sort((a, b) => a.f.fixture.date.localeCompare(b.f.fixture.date));
  console.log(`Found ${fixtures.length} cup fixture(s) in the API.`);
  for (const { lid, f } of fixtures) {
    console.log(`   ${CUPS[lid].nameHe} · ${f.fixture.date.slice(0, 16)} · ${f.teams.home.name} vs ${f.teams.away.name} [${f.fixture.status.short}] (${f.league.round})`);
  }
  if (fixtures.length === 0) { await prisma.$disconnect(); return; }
  if (!execute) { console.log('\n(dry-run — nothing written; re-run with --execute)'); await prisma.$disconnect(); return; }

  let season = await prisma.season.findFirst({ where: { year: seasonYear } });
  if (!season) {
    season = await prisma.season.create({ data: { year: seasonYear, name: seasonName, startDate: new Date(`${seasonYear}-08-01`), endDate: new Date(`${seasonYear + 1}-06-30`) } });
    console.log(`+ created season ${seasonName}`);
  }

  const compCache = new Map();
  async function ensureComp(lid) {
    if (compCache.has(lid)) return compCache.get(lid);
    const meta = CUPS[lid];
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
    const existing = await prisma.team.findFirst({ where: { apiFootballId: apiTeam.id, seasonId: season.id } });
    if (existing) return existing;
    const nameHe = nameHeByApiId.get(apiTeam.id) || apiTeam.name;
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
