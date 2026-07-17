#!/usr/bin/env node
/**
 * scrape-sofascore-squads.js — import current-season club squads (Player rows)
 * from Sofascore, for the pre-season window when API-Football's /players is
 * empty and /players/squads is stale (see sync-squads.js header). Sofascore's
 * team page carries the accurate current roster earlier.
 *
 * Access route: api.sofascore.com is Cloudflare-blocked for our datacenter IP,
 * so we render a www.sofascore.com page via Firecrawl's stealth proxy and
 * executeJavascript a same-origin fetch to /team/{id}/players (see
 * scrape-sofascore-lineups.js + memory/sofascore-scraping.md).
 *
 * Reuses sync-squads.js upsert semantics:
 *   - existing players INHERIT their curated nameHe (never overwritten); the
 *     surname+first-initial matcher links Sofascore's full name ("Ofir
 *     Marciano") to our canonical row across seasons.
 *   - new players get nameHe = nameEn on create, then the post-run
 *     transliterate-players.js pass Hebrew-izes them.
 *   - jersey conflict on [jerseyNumber, teamId] → null the dup (Sofascore rosters
 *     include academy players who share first-team numbers).
 *   - NEVER deletes. Photos skipped (img.sofascore.com is 403 for our IP) →
 *     null → initials placeholder.
 *
 * Idempotent: stores additionalInfo.sofascoreId and re-matches on it first.
 *
 * Usage:
 *   node scripts/scrape-sofascore-squads.js                 # dry-run, 2026, all 14
 *   node scripts/scrape-sofascore-squads.js --team 563      # one club (our apiFootballId)
 *   node scripts/scrape-sofascore-squads.js --execute       # write
 * Env fallbacks (for ssh-stdin runs): SQ_SEASON, SQ_TEAM, SQ_EXECUTE=1
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}
loadEnv(path.resolve(__dirname, '..', '.env'));

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const SEASON_YEAR = parseInt(arg('season', process.env.SQ_SEASON || '2026'), 10);
const TEAM_FILTER = arg('team', process.env.SQ_TEAM || null) ? parseInt(arg('team', process.env.SQ_TEAM), 10) : null;
const EXECUTE = process.argv.includes('--execute') || process.env.SQ_EXECUTE === '1';
// --force: import even after the league has kicked off. WITHOUT it, once real
// Ligat Ha'al games are played the import is skipped — this is a PRE-SEASON tool
// (API-Football's sync-squads, with per-season stats, takes over in-season and
// Sofascore's full-club roster would otherwise re-add academy players).
const FORCE = process.argv.includes('--force') || process.env.SQ_FORCE === '1';
const FC_KEY = process.env.FIRECRAWL_API_KEY;

// Sofascore team id → our Team.apiFootballId (Ligat Ha'al, verified 2026/27).
const SS_TO_AF = {
  5204: 657, 5392: 4481, 5202: 563, 5201: 2253, 5399: 4510, 86406: 4486,
  5199: 4488, 7385: 4489, 5396: 4501, 61702: 6181, 5197: 4195, 5333: 4495,
  5395: 4505, 5198: 604,
};
const POS_MAP = { G: 'Goalkeeper', D: 'Defender', M: 'Midfielder', F: 'Attacker' };

const stripAccents = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const norm = (s) => stripAccents(s).replace(/[.,'"`\-]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
const tokensOf = (s) => norm(s).split(' ').filter((t) => t.length > 1);
const firstInitial = (s) => (norm(s)[0] || '');

// ─── Firecrawl: fetch trimmed squads for the given Sofascore team ids ─────────
async function fetchSquads(ssIds) {
  const script =
    `(async()=>{const out={};for(const id of ${JSON.stringify(ssIds)}){try{` +
    `const r=await fetch('https://api.sofascore.com/api/v1/team/'+id+'/players');` +
    `if(r.status!==200){out[id]={status:r.status};continue;}const j=await r.json();` +
    `out[id]={status:200,players:(j.players||[]).map(e=>{const p=e.player;return{` +
    `id:p.id,name:p.name,firstName:p.firstName,lastName:p.lastName,jerseyNumber:p.jerseyNumber,` +
    `position:p.position,dob:p.dateOfBirthTimestamp,country:p.country&&p.country.name,underage:p.underage};})};` +
    `}catch(e){out[id]={err:String(e)};}}return JSON.stringify(out);})()`;
  const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: { Authorization: `Bearer ${FC_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: 'https://www.sofascore.com/football/tournament/israel/ligat-haal/266',
      proxy: 'stealth', waitFor: 5000, formats: ['markdown'],
      actions: [{ type: 'wait', milliseconds: 4000 }, { type: 'executeJavascript', script }],
    }),
  });
  const text = await res.text();
  let d; try { d = JSON.parse(text); } catch { throw new Error('Firecrawl non-JSON: ' + text.slice(0, 150)); }
  if (!d.success) throw new Error('Firecrawl error: ' + (d.error || JSON.stringify(d)).slice(0, 200));
  const raw = (d.data?.actions?.javascriptReturns || [])[0]?.value;
  if (!raw) throw new Error('No JS return from Firecrawl');
  return JSON.parse(typeof raw === 'string' ? raw : JSON.stringify(raw));
}

// ─── canonical lookup: this club's players across all seasons ─────────────────
async function buildClubLookup(teamNameHe, teamNameEn) {
  const players = await prisma.player.findMany({
    where: { team: { OR: [{ nameHe: teamNameHe }, { nameEn: teamNameEn }] } },
    select: {
      id: true, canonicalPlayerId: true, nameHe: true, nameEn: true,
      firstNameHe: true, lastNameHe: true, firstNameEn: true, lastNameEn: true,
      nationalityHe: true, team: { select: { season: { select: { year: true } } } },
    },
    orderBy: { team: { season: { year: 'desc' } } },
  });
  const index = new Map(); // surname token → [{ p, fi, year }]
  for (const p of players) {
    const fi = firstInitial(p.firstNameEn || p.nameEn);
    const year = p.team?.season?.year || 0;
    for (const tok of new Set(tokensOf(p.lastNameEn || p.nameEn))) {
      if (!index.has(tok)) index.set(tok, []);
      index.get(tok).push({ p, fi, year });
    }
  }
  return index;
}
function findCanonical(index, ssName) {
  const toks = tokensOf(ssName);
  if (!toks.length) return null;
  const cands = index.get(toks[toks.length - 1]);
  if (!cands || !cands.length) return null;
  const withFi = cands.filter((c) => c.fi === firstInitial(ssName));
  const pool = (withFi.length ? withFi : cands).sort((a, b) => b.year - a.year);
  const chosen = pool[0].p;
  return chosen;
}

// ─── per-player upsert into the season team ───────────────────────────────────
async function upsertSquadPlayer(sp, team, existingBySofa, existingBySurname, clubIndex) {
  const nameEn = sp.name;
  if (!nameEn) return 'skipped';

  const canonical = findCanonical(clubIndex, nameEn); // for curated nameHe
  const canonicalPlayerId = canonical ? (canonical.canonicalPlayerId || canonical.id) : null;

  // find existing row already on THIS season-team (idempotency)
  let existing = existingBySofa.get(sp.id) || null;
  if (!existing) {
    const key = `${tokensOf(nameEn).slice(-1)[0]}|${firstInitial(nameEn)}`;
    existing = existingBySurname.get(key) || null;
  }

  const jerseyNum = sp.jerseyNumber != null && Number.isFinite(parseInt(sp.jerseyNumber, 10)) ? parseInt(sp.jerseyNumber, 10) : null;
  const jerseyConflict = jerseyNum != null
    ? await prisma.player.findUnique({ where: { jerseyNumber_teamId: { jerseyNumber: jerseyNum, teamId: team.id } }, select: { id: true } })
    : null;
  const safeJersey = jerseyConflict && jerseyConflict.id !== existing?.id ? null : jerseyNum;

  const en = {
    nameEn,
    firstNameEn: sp.firstName || null,
    lastNameEn: sp.lastName || null,
    position: sp.position ? (POS_MAP[sp.position] || sp.position) : null,
    jerseyNumber: safeJersey,
    nationalityEn: sp.country || null,
    birthDate: sp.dob ? new Date(sp.dob * 1000) : null,
  };
  const additionalInfo = { source: 'sofascore-squad', sofascoreId: sp.id, syncedAt: new Date().toISOString() };

  if (!existing) {
    if (!EXECUTE) return canonical ? 'new(returning)' : 'new';
    await prisma.player.create({
      data: {
        ...en,
        nameHe: canonical?.nameHe || nameEn,
        firstNameHe: canonical?.firstNameHe || null,
        lastNameHe: canonical?.lastNameHe || null,
        nationalityHe: canonical?.nationalityHe || en.nationalityEn,
        teamId: team.id,
        canonicalPlayerId,
        additionalInfo,
      },
    });
    return canonical ? 'new(returning)' : 'new';
  }

  if (!EXECUTE) return 'update';
  await prisma.player.update({
    where: { id: existing.id },
    data: {
      ...en,
      // He fields fill-only — never clobber curated Hebrew
      nameHe: existing.nameHe || canonical?.nameHe || nameEn,
      firstNameHe: existing.firstNameHe || canonical?.firstNameHe || null,
      lastNameHe: existing.lastNameHe || canonical?.lastNameHe || null,
      nationalityHe: existing.nationalityHe || en.nationalityEn,
      canonicalPlayerId: existing.canonicalPlayerId || canonicalPlayerId,
      additionalInfo,
    },
  });
  return 'update';
}

async function main() {
  console.log(`\n=== scrape-sofascore-squads — season=${SEASON_YEAR}${TEAM_FILTER ? ` team=${TEAM_FILTER}` : ''} ${EXECUTE ? '(EXECUTE)' : '(DRY-RUN)'} ===`);
  if (!FC_KEY) { console.error('Missing FIRECRAWL_API_KEY'); process.exit(1); }

  const season = await prisma.season.findUnique({ where: { year: SEASON_YEAR } });
  if (!season) { console.error(`No Season ${SEASON_YEAR}`); process.exit(1); }

  // Season-started guard: this is a pre-season tool. Once Ligat Ha'al games are
  // played, API-Football's sync-squads owns squads (per-season stats), so skip
  // unless --force or a single --team is requested.
  if (!FORCE && !TEAM_FILTER) {
    const startedLeagueGames = await prisma.game.count({
      where: { seasonId: season.id, competitionId: 'comp_liga_haal', status: { in: ['COMPLETED', 'ONGOING'] } },
    });
    if (startedLeagueGames > 0) {
      console.log(`\nLigat Ha'al ${season.name} has already started (${startedLeagueGames} played) — API-Football sync-squads owns squads now. Skipping. Use --force to override.`);
      await prisma.$disconnect();
      return;
    }
  }

  // resolve our teams by apiFootballId
  const wantAf = TEAM_FILTER ? [TEAM_FILTER] : Object.values(SS_TO_AF);
  const ourTeams = await prisma.team.findMany({
    where: { seasonId: season.id, apiFootballId: { in: wantAf } },
    select: { id: true, nameHe: true, nameEn: true, apiFootballId: true },
  });
  const afToTeam = new Map(ourTeams.map((t) => [t.apiFootballId, t]));
  const ssIds = Object.entries(SS_TO_AF)
    .filter(([, af]) => afToTeam.has(af))
    .map(([ss]) => parseInt(ss, 10));
  console.log(`Resolved ${ourTeams.length} of ${wantAf.length} teams; fetching ${ssIds.length} Sofascore squads…`);

  const squads = await fetchSquads(ssIds);

  const results = [];
  let totalNew = 0, totalReturning = 0, totalUpdate = 0;
  for (const ss of ssIds) {
    const af = SS_TO_AF[ss];
    const team = afToTeam.get(af);
    const data = squads[ss];
    if (!data || data.status !== 200 || !Array.isArray(data.players)) {
      console.log(`\n→ ${team.nameHe}: no squad (status ${data?.status || data?.err})`);
      results.push({ team: team.nameHe, fetched: 0, new: 0, returning: 0, update: 0 });
      continue;
    }
    const players = data.players.filter((p) => p.jerseyNumber != null); // inclusive: all jersey-numbered
    const clubIndex = await buildClubLookup(team.nameHe, team.nameEn);
    const existingRows = await prisma.player.findMany({
      where: { teamId: team.id },
      select: { id: true, nameHe: true, nameEn: true, firstNameHe: true, lastNameHe: true, firstNameEn: true, lastNameEn: true, nationalityHe: true, canonicalPlayerId: true, additionalInfo: true },
    });
    const existingBySofa = new Map();
    const existingBySurname = new Map();
    for (const r of existingRows) {
      const sId = r.additionalInfo?.sofascoreId;
      if (sId) existingBySofa.set(sId, r);
      const key = `${tokensOf(r.lastNameEn || r.nameEn).slice(-1)[0]}|${firstInitial(r.firstNameEn || r.nameEn)}`;
      if (!existingBySurname.has(key)) existingBySurname.set(key, r);
    }

    let nw = 0, ret = 0, upd = 0;
    for (const sp of players) {
      const r = await upsertSquadPlayer(sp, team, existingBySofa, existingBySurname, clubIndex);
      if (r === 'new') nw++;
      else if (r === 'new(returning)') ret++;
      else if (r === 'update') upd++;
    }
    totalNew += nw; totalReturning += ret; totalUpdate += upd;
    console.log(`\n→ ${team.nameHe} (ss=${ss}): ${players.length} players → returning=${ret} brand-new=${nw} update=${upd}`);
    if (TEAM_FILTER) {
      for (const sp of players) {
        const c = findCanonical(clubIndex, sp.name);
        console.log(`   #${sp.jerseyNumber} ${sp.name} ${c ? '→ ' + (c.nameHe) : '(new → transliterate)'}`);
      }
    }
    results.push({ team: team.nameHe, fetched: players.length, new: nw, returning: ret, update: upd });
  }

  console.log('\n=== Summary ===');
  console.table(results);
  console.log(`Totals: returning=${totalReturning} brand-new=${totalNew} update=${totalUpdate}`);
  console.log(EXECUTE ? 'Mode: EXECUTE — written.' : 'Mode: DRY-RUN — pass --execute to write.');

  if (EXECUTE && totalNew + totalReturning + totalUpdate > 0) {
    console.log(`\n→ Transliterating new player names (season=${SEASON_YEAR})…`);
    const r = spawnSync('node', [path.resolve(__dirname, 'transliterate-players.js'), '--season', String(SEASON_YEAR), '--apply'], { stdio: 'inherit' });
    if (r.status !== 0) console.error('  ✗ transliteration failed — run it manually');
  }
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error('FATAL', e.message); await prisma.$disconnect(); process.exit(1); });
