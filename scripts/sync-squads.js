#!/usr/bin/env node
/**
 * sync-squads.js — sync team squads (Player rows) from API-Football.
 *
 * Squads are otherwise imported ONLY through the authenticated
 * /api/admin/fetch "players" resource — there's no unattended/cron path, so a
 * freshly-started season's teams sit at 0 players until someone opens the
 * admin UI. This script gives that path.
 *
 * Mirrors src/app/api/admin/fetch/route.ts's players-resource semantics
 * (fetchSeasonPlayers @ ~502, players block @ ~1442-1660):
 *   - GET /players?team=&season=, paginated
 *   - jersey number from statistics.games.number, falling back to player.number
 *   - position passthrough — API-Football already returns human strings
 *     ("Attacker"/"Midfielder"/"Defender"/"Goalkeeper"); the route has no
 *     separate mapping table, so neither does this script
 *   - canonical-player linking: same apiFootballId in another season → its
 *     canonicalPlayerId (or itself); else exact nameEn match
 *
 * Extra vs. the route:
 *   - If /players returns 0 rows for a team+season (API-Football hasn't
 *     populated the new season's stats yet), falls back to
 *     GET /players/squads?team= — the season-less "current roster" endpoint,
 *     which IS fresh during the transfer window. Rows from it are tagged
 *     additionalInfo.source = 'squads-endpoint' (no per-season stats).
 *
 * Deviations from the route (deliberate, for a standalone script):
 *   - find-existing is (apiFootballId, teamId), else exact nameEn+teamId — the
 *     route also tries the jerseyNumber unique key and a translateName(nameHe)
 *     guess; skipped here since translateName is a no-op for player names.
 *   - EN fields (position/nationality/birthDate/age/height/weight/jersey/
 *     names) are "new value if present, else keep existing" — NOT an
 *     unconditional overwrite like the route's update spread. This matters
 *     here specifically because /players/squads returns far fewer fields than
 *     /players; an unconditional overwrite would blank out season-sourced
 *     birthDate/nationality/height/weight the moment a team falls back to the
 *     squads endpoint. *He fields stay strictly fill-only, same as the route.
 *   - nameHe/nationalityHe/birthPlaceHe/birthCountryHe default to the EN value
 *     on create (never touched on update) — Hebrew backfill is
 *     scripts/transliterate-players.js's job, same as it is for the route.
 *   - NEVER deletes. The route prunes API-owned players missing from the
 *     response (players without an apiFootballId — IFA/manual — are already
 *     outside that prune's universe, matching the "additive" comment there).
 *     This script only *counts* how many would've been pruned, for visibility.
 *
 * Usage:
 *   node scripts/sync-squads.js                    # dry-run, current season, both leagues
 *   node scripts/sync-squads.js --season 2026
 *   node scripts/sync-squads.js --league 383        # Ligat Ha'al only (382 = Leumit)
 *   node scripts/sync-squads.js --team 563          # one team by apiFootballId (surgical/testing)
 *   node scripts/sync-squads.js --execute           # write to DB (default is dry-run)
 *
 * Cron: safe to run weekly, unattended. Idempotent — re-running with no squad
 * changes reports "unchanged" for everyone and writes nothing new.
 */

'use strict';
const fs = require('fs');
const fsPromises = require('fs/promises');
const path = require('path');

// .env loader (mirrors matchday-update.js / notify-matches.js)
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

const API_KEY = process.env.API_FOOTBALL_KEY;
const BASE_URL = (process.env.API_FOOTBALL_BASE_URL || 'https://v3.football.api-sports.io').replace(/\/$/, '');
const API_HOST = process.env.API_FOOTBALL_HOST;

// Israeli league Competition.id values (see prisma/schema.prisma + seeded competitions).
const COMP_BY_LEAGUE_ARG = {
  '383': ['comp_liga_haal'],
  '382': ['comp_liga_leumit'],
  all: ['comp_liga_haal', 'comp_liga_leumit'],
};

// ─── args ───────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(name, dflt = null) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : dflt;
}
const EXECUTE = args.includes('--execute');
const LEAGUE_ARG = getArg('--league', 'all');
const TEAM_FILTER = getArg('--team') ? parseInt(getArg('--team'), 10) : null;

function defaultSeasonYear() {
  const now = new Date();
  // Israeli season runs Aug-May; month>=7 (Jul, 0-indexed 6) → current year starts the new season.
  return now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
}
const SEASON_YEAR = getArg('--season') ? parseInt(getArg('--season'), 10) : defaultSeasonYear();

const COMP_IDS = COMP_BY_LEAGUE_ARG[LEAGUE_ARG];
if (!COMP_IDS) {
  console.error(`Unknown --league "${LEAGUE_ARG}" (expected all|383|382)`);
  process.exit(1);
}

// ─── API-Football fetch: rate-limited + retried, mirrors src/lib/api-football.ts ───
const MIN_INTERVAL_MS = 250;
const MAX_RETRY_ATTEMPTS = 4;
const RETRY_BASE_DELAY_MS = 3000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastRequestAt = 0;

function extractApiErrorMessage(payload) {
  if (!payload) return 'API-Football request failed.';
  if (typeof payload.message === 'string' && payload.message.trim()) return payload.message;
  if (Array.isArray(payload.errors) && payload.errors.length > 0) return payload.errors.join(', ');
  if (payload.errors && typeof payload.errors === 'object') {
    const first = Object.values(payload.errors)[0];
    if (typeof first === 'string' && first.trim()) return first;
  }
  return 'API-Football request failed.';
}
function hasApiErrors(errors) {
  if (Array.isArray(errors)) return errors.length > 0;
  if (errors && typeof errors === 'object') return Object.keys(errors).length > 0;
  return Boolean(errors);
}

async function afRequest(pathAndQuery, attempt = 0) {
  const wait = Math.max(0, lastRequestAt + MIN_INTERVAL_MS - Date.now());
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();

  const headers = { 'x-apisports-key': API_KEY };
  if (API_HOST) headers['x-rapidapi-host'] = API_HOST;

  const res = await fetch(`${BASE_URL}${pathAndQuery}`, { headers, signal: AbortSignal.timeout(30000) });
  const payload = await res.json().catch(() => ({}));
  const errorMessage = extractApiErrorMessage(payload);
  const isTemporaryRateLimited = res.status === 429 || /too many requests|rate limit/i.test(errorMessage);
  const isDailyLimitExceeded = /request limit|limit for the day|upgrade your plan/i.test(errorMessage);

  if (isDailyLimitExceeded) {
    const err = new Error(errorMessage);
    err.dailyLimit = true;
    throw err;
  }
  if (isTemporaryRateLimited && attempt < MAX_RETRY_ATTEMPTS) {
    await sleep(RETRY_BASE_DELAY_MS * (attempt + 1));
    return afRequest(pathAndQuery, attempt + 1);
  }
  if (isTemporaryRateLimited) throw new Error(errorMessage);
  if (!res.ok || hasApiErrors(payload.errors)) throw new Error(errorMessage);

  return payload; // { response, paging?, ... }
}

/** GET /players?team=&season=, paginated via paging.current/paging.total. */
async function fetchSeasonPlayers(teamApiId, seasonYear) {
  const rows = [];
  let page = 1;
  for (;;) {
    const payload = await afRequest(`/players?team=${teamApiId}&season=${seasonYear}&page=${page}`);
    const pageRows = payload.response || [];
    rows.push(...pageRows);
    const current = payload.paging?.current ?? page;
    const total = payload.paging?.total ?? page;
    if (!pageRows.length || current >= total || page > 50) break;
    page += 1;
  }
  return rows;
}

/** GET /players/squads?team= — season-less current roster, fresh during the transfer window. */
async function fetchCurrentSquad(teamApiId) {
  const payload = await afRequest(`/players/squads?team=${teamApiId}`);
  const teamBlock = (payload.response || [])[0];
  return teamBlock?.players || [];
}

// ─── photo storage (mirrors src/lib/media-storage.ts's storePlayerPhotoLocally) ───
function slugify(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}
function extensionFromContentType(contentType) {
  if (!contentType) return '.jpg';
  if (contentType.includes('png')) return '.png';
  if (contentType.includes('webp')) return '.webp';
  if (contentType.includes('svg')) return '.svg';
  return '.jpg';
}
function extensionFromUrl(url) {
  try {
    const ext = path.extname(new URL(url).pathname);
    return ext && ext.length <= 5 ? ext : null;
  } catch {
    return null;
  }
}
async function storePlayerPhotoLocally({ remoteUrl, seasonYear, teamName, playerId, playerName }) {
  if (!remoteUrl) return null;
  try {
    const probe = await fetch(remoteUrl, { method: 'HEAD' });
    const ext = extensionFromUrl(remoteUrl) || extensionFromContentType(probe.headers.get('content-type'));
    const response = await fetch(remoteUrl);
    if (!response.ok) throw new Error(`download failed: ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    const targetRelativePath = path.join(
      'uploads', 'players', String(seasonYear), slugify(teamName), `${playerId}-${slugify(playerName)}${ext}`
    );
    const baseDir = path.resolve(process.cwd(), 'public', 'uploads');
    const absolutePath = path.resolve(process.cwd(), 'public', targetRelativePath);
    if (!absolutePath.startsWith(baseDir)) throw new Error('invalid path');
    await fsPromises.mkdir(path.dirname(absolutePath), { recursive: true });
    await fsPromises.writeFile(absolutePath, buffer);
    return `/${targetRelativePath.replace(/\\/g, '/')}`;
  } catch {
    return remoteUrl; // fall back to the remote URL, same as the route
  }
}

// ─── canonical player matching (mirrors findCanonicalPlayerMatch in the route) ───
async function findCanonicalPlayerMatch(apiFootballId, nameEn) {
  const matched =
    (apiFootballId
      ? await prisma.player.findFirst({ where: { apiFootballId }, orderBy: [{ canonicalPlayerId: 'asc' }, { createdAt: 'asc' }] })
      : null) ||
    (nameEn
      ? await prisma.player.findFirst({ where: { nameEn }, orderBy: [{ canonicalPlayerId: 'asc' }, { createdAt: 'asc' }] })
      : null);
  if (!matched) return null;
  if (matched.canonicalPlayerId) return prisma.player.findUnique({ where: { id: matched.canonicalPlayerId } });
  return matched;
}

// ─── normalize API rows to a common shape ──────────────────────────────────
function normalizeSeasonEntry(entry, apiTeamId) {
  const p = entry.player || {};
  const stats = Array.isArray(entry.statistics)
    ? entry.statistics.find((s) => s?.team?.id === apiTeamId) || entry.statistics[0]
    : null;
  const jerseyNumber =
    typeof stats?.games?.number === 'number' ? stats.games.number : typeof p.number === 'number' ? p.number : null;
  return {
    source: 'season',
    apiId: typeof p.id === 'number' ? p.id : null,
    nameEn: p.name || null,
    firstNameEn: p.firstname || null,
    lastNameEn: p.lastname || null,
    photo: p.photo || null,
    position: stats?.games?.position || p.position || null,
    jerseyNumber,
    birthDate: p.birth?.date || null,
    birthPlaceEn: p.birth?.place || null,
    birthCountryEn: p.birth?.country || null,
    nationalityEn: p.nationality || null,
    age: typeof p.age === 'number' ? p.age : null,
    height: p.height || null,
    weight: p.weight || null,
    isInjured: typeof p.injured === 'boolean' ? p.injured : null,
    raw: { player: p, statistics: entry.statistics || [] },
  };
}
function normalizeSquadEntry(p) {
  return {
    source: 'squad',
    apiId: typeof p.id === 'number' ? p.id : null,
    nameEn: p.name || null,
    firstNameEn: null,
    lastNameEn: null,
    photo: p.photo || null,
    position: p.position || null,
    jerseyNumber: typeof p.number === 'number' ? p.number : null,
    birthDate: null,
    birthPlaceEn: null,
    birthCountryEn: null,
    nationalityEn: null,
    age: typeof p.age === 'number' ? p.age : null,
    height: null,
    weight: null,
    isInjured: null,
    raw: { player: p, statistics: [] },
  };
}

// EN fields: new value if present, else keep existing (see file header for why
// this can't be an unconditional overwrite like the route's).
function mergedEnFields(entry, existing, safeJerseyNumber, birthDate) {
  return {
    jerseyNumber: safeJerseyNumber ?? existing?.jerseyNumber ?? null,
    position: entry.position || existing?.position || null,
    nationalityEn: entry.nationalityEn || existing?.nationalityEn || null,
    birthDate: birthDate || existing?.birthDate || null,
    age: entry.age ?? existing?.age ?? null,
    height: entry.height || existing?.height || null,
    weight: entry.weight || existing?.weight || null,
    isInjured: entry.isInjured ?? existing?.isInjured ?? null,
    firstNameEn: entry.firstNameEn || existing?.firstNameEn || null,
    lastNameEn: entry.lastNameEn || existing?.lastNameEn || null,
    birthPlaceEn: entry.birthPlaceEn || existing?.birthPlaceEn || null,
    birthCountryEn: entry.birthCountryEn || existing?.birthCountryEn || null,
  };
}
function fieldsDiffer(existing, merged) {
  for (const key of Object.keys(merged)) {
    const a = existing?.[key] instanceof Date ? existing[key].toISOString() : existing?.[key] ?? null;
    const b = merged[key] instanceof Date ? merged[key].toISOString() : merged[key] ?? null;
    if (a !== b) return true;
  }
  return false;
}

// ─── per-player upsert ──────────────────────────────────────────────────────
async function upsertPlayer(entry, team, seasonYear) {
  if (!entry.nameEn) return 'skipped';

  const existingByApiId =
    entry.apiId != null
      ? await prisma.player.findUnique({ where: { apiFootballId_teamId: { apiFootballId: entry.apiId, teamId: team.id } } })
      : null;
  const existingPlayer =
    existingByApiId || (await prisma.player.findFirst({ where: { nameEn: entry.nameEn, teamId: team.id } }));

  const canonicalPlayer = await findCanonicalPlayerMatch(entry.apiId, entry.nameEn);

  const jerseyConflict =
    entry.jerseyNumber != null
      ? await prisma.player.findUnique({
          where: { jerseyNumber_teamId: { jerseyNumber: entry.jerseyNumber, teamId: team.id } },
          select: { id: true },
        })
      : null;
  const safeJerseyNumber = jerseyConflict && jerseyConflict.id !== existingPlayer?.id ? null : entry.jerseyNumber;

  const birthDate = entry.birthDate ? new Date(entry.birthDate) : null;
  const merged = mergedEnFields(entry, existingPlayer, safeJerseyNumber, birthDate);

  const canonicalPlayerId =
    canonicalPlayer && canonicalPlayer.id !== existingPlayer?.id ? canonicalPlayer.id : existingPlayer?.canonicalPlayerId || null;

  const additionalInfo = {
    ...entry.raw,
    source: entry.source === 'squad' ? 'squads-endpoint' : 'players-endpoint',
    syncedAt: new Date().toISOString(),
  };

  if (!existingPlayer) {
    if (!EXECUTE) return 'new';
    let photoUrl = entry.photo || null;
    if (entry.photo) {
      photoUrl = await storePlayerPhotoLocally({
        remoteUrl: entry.photo,
        seasonYear,
        teamName: team.nameEn,
        playerId: entry.apiId || entry.nameEn,
        playerName: entry.nameEn,
      });
    }
    await prisma.player.create({
      data: {
        ...merged,
        apiFootballId: entry.apiId,
        nameEn: entry.nameEn,
        nameHe: canonicalPlayer?.nameHe || entry.nameEn,
        firstNameHe: canonicalPlayer?.firstNameHe || null,
        lastNameHe: canonicalPlayer?.lastNameHe || null,
        nationalityHe: canonicalPlayer?.nationalityHe || merged.nationalityEn,
        birthPlaceHe: canonicalPlayer?.birthPlaceHe || merged.birthPlaceEn,
        birthCountryHe: canonicalPlayer?.birthCountryHe || merged.birthCountryEn,
        photoUrl,
        teamId: team.id,
        canonicalPlayerId,
        additionalInfo,
      },
    });
    return 'new';
  }

  if (!fieldsDiffer(existingPlayer, merged)) return 'unchanged';
  if (!EXECUTE) return 'updated';

  let photoUrl = existingPlayer.photoUrl;
  if (entry.photo) {
    photoUrl = await storePlayerPhotoLocally({
      remoteUrl: entry.photo,
      seasonYear,
      teamName: team.nameEn,
      playerId: entry.apiId || entry.nameEn,
      playerName: entry.nameEn,
    });
  }
  await prisma.player.update({
    where: { id: existingPlayer.id },
    data: {
      ...merged,
      apiFootballId: entry.apiId || existingPlayer.apiFootballId,
      nameHe: existingPlayer.nameHe || entry.nameEn,
      firstNameHe: existingPlayer.firstNameHe || canonicalPlayer?.firstNameHe || null,
      lastNameHe: existingPlayer.lastNameHe || canonicalPlayer?.lastNameHe || null,
      nationalityHe: existingPlayer.nationalityHe || merged.nationalityEn,
      birthPlaceHe: existingPlayer.birthPlaceHe || merged.birthPlaceEn,
      birthCountryHe: existingPlayer.birthCountryHe || merged.birthCountryEn,
      photoUrl,
      canonicalPlayerId,
      additionalInfo,
    },
  });
  return 'updated';
}

// ─── team resolution ────────────────────────────────────────────────────────
async function resolveTeams(season) {
  if (TEAM_FILTER != null) {
    const team = await prisma.team.findFirst({ where: { seasonId: season.id, apiFootballId: TEAM_FILTER } });
    return { teams: team ? [team] : [], skipped: [] };
  }
  const standingRows = await prisma.standing.findMany({
    where: { seasonId: season.id, competitionId: { in: COMP_IDS } },
    select: { teamId: true },
    distinct: ['teamId'],
  });
  const teamIds = standingRows.map((r) => r.teamId);
  if (!teamIds.length) return { teams: [], skipped: [] };
  const allTeams = await prisma.team.findMany({ where: { id: { in: teamIds } } });
  const teams = allTeams.filter((t) => t.apiFootballId != null);
  const skipped = allTeams.filter((t) => t.apiFootballId == null);
  return { teams, skipped };
}

async function syncTeam(team) {
  const label = team.nameHe || team.nameEn;
  console.log(`\n→ ${label} (af=${team.apiFootballId})`);

  let entries = [];
  let source = 'season';
  const seasonRows = await fetchSeasonPlayers(team.apiFootballId, SEASON_YEAR);
  if (seasonRows.length > 0) {
    entries = seasonRows.map((row) => normalizeSeasonEntry(row, team.apiFootballId));
  } else {
    console.log(`    /players returned 0 for season=${SEASON_YEAR} — trying /players/squads (current roster)`);
    const squadPlayers = await fetchCurrentSquad(team.apiFootballId);
    entries = squadPlayers.map(normalizeSquadEntry);
    source = 'squad';
  }

  if (!entries.length) {
    console.log('    no players from either endpoint');
    return { team: label, apiId: team.apiFootballId, source: 'none', fetched: 0, new: 0, updated: 0, unchanged: 0, staleInDb: 0 };
  }

  const existingTeamPlayers = await prisma.player.findMany({
    where: { teamId: team.id },
    select: { apiFootballId: true },
  });
  const importedApiIds = new Set(entries.map((e) => e.apiId).filter((id) => id != null));
  const staleInDb = existingTeamPlayers.filter((p) => p.apiFootballId != null && !importedApiIds.has(p.apiFootballId)).length;

  let created = 0, updated = 0, unchanged = 0, skipped = 0;
  for (const entry of entries) {
    const result = await upsertPlayer(entry, team, SEASON_YEAR);
    if (result === 'new') created++;
    else if (result === 'updated') updated++;
    else if (result === 'unchanged') unchanged++;
    else skipped++;
  }

  console.log(
    `    ${source === 'squad' ? 'squad-sourced (no season stats)' : 'season'}: ${entries.length} from API → ` +
      `new=${created} updated=${updated} unchanged=${unchanged}${skipped ? ` skipped=${skipped}` : ''} | ` +
      `DB players not in response, kept: ${staleInDb}`
  );

  return { team: label, apiId: team.apiFootballId, source, fetched: entries.length, new: created, updated, unchanged, staleInDb };
}

// ─── main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n=== sync-squads — season=${SEASON_YEAR} league=${LEAGUE_ARG}${TEAM_FILTER ? ` team=${TEAM_FILTER}` : ''} ${EXECUTE ? '(EXECUTE)' : '(DRY RUN)'} ===`);

  const season = await prisma.season.findUnique({ where: { year: SEASON_YEAR } });
  if (!season) {
    console.log(`\nNo Season row for year=${SEASON_YEAR} yet — nothing to sync. (Season/team rows come from the standings resource, not this script.)`);
    await prisma.$disconnect();
    return;
  }

  const { teams, skipped } = await resolveTeams(season);
  console.log(`\nTeams in scope: ${teams.length}${skipped.length ? ` (skipped ${skipped.length} without apiFootballId: ${skipped.map((t) => t.nameHe || t.nameEn).join(', ')})` : ''}`);
  teams.forEach((t) => console.log(`  • ${t.nameHe || t.nameEn} (af=${t.apiFootballId})`));

  if (!teams.length) {
    console.log('\nNo teams to sync.');
    await prisma.$disconnect();
    return;
  }

  if (!API_KEY) {
    console.log('\nAPI_FOOTBALL_KEY missing — cannot call API-Football. Skipping sync (dry-run of team scope only).');
    await prisma.$disconnect();
    return;
  }

  const results = [];
  for (const team of teams) {
    try {
      results.push(await syncTeam(team));
    } catch (e) {
      console.error(`  ✗ ${team.nameHe || team.nameEn}: ${e.message}`);
      results.push({ team: team.nameHe || team.nameEn, apiId: team.apiFootballId, source: 'error', fetched: 0, new: 0, updated: 0, unchanged: 0, staleInDb: 0, error: e.message });
      if (e.dailyLimit) {
        console.error('  Daily API-Football limit reached — stopping early.');
        break;
      }
    }
  }

  console.log('\n=== Summary ===');
  console.table(
    results.map((r) => ({
      team: r.team, apiId: r.apiId, source: r.source, fetched: r.fetched,
      new: r.new, updated: r.updated, unchanged: r.unchanged, staleInDb: r.staleInDb,
    }))
  );
  const totals = results.reduce(
    (acc, r) => ({ new: acc.new + r.new, updated: acc.updated + r.updated, unchanged: acc.unchanged + r.unchanged }),
    { new: 0, updated: 0, unchanged: 0 }
  );
  console.log(`Totals: new=${totals.new} updated=${totals.updated} unchanged=${totals.unchanged}`);
  console.log(EXECUTE ? 'Mode: EXECUTE — written to DB.' : 'Mode: DRY-RUN — no writes. Pass --execute to apply.');

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect();
  process.exitCode = 1;
});
