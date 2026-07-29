#!/usr/bin/env node
/**
 * backfill-apifootball-ids.js — set apiFootballId on EXISTING Player rows by
 * name-matching them to API-Football's current squad, so a later sync-squads
 * matches by id (updates in place) instead of creating duplicates, and so
 * API-Football lineup/event imports link them (Hebrew name + photo).
 *
 * Why: squads created via scrape-sofascore-squads.js have NO apiFootballId.
 * sync-squads matches by (apiFootballId) then EXACT nameEn — an abbreviated
 * "O. Marciano" vs our "Ofir Marciano" misses, creating a duplicate. This
 * fuzzy-links first (surname token + first initial, unique-match only) so no
 * duplicates and no name/photo regressions.
 *
 * Only sets apiFootballId where it is currently NULL and the match is
 * unambiguous (exactly one same-team record for that surname+initial, and that
 * API id isn't already taken by another of our rows). Never overwrites.
 *
 * Usage:
 *   node scripts/backfill-apifootball-ids.js --season 2026 [--team 563] [--execute]
 *   (default dry-run)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Minimal .env loader (API key isn't in the shell env for ssh-piped node).
(function loadEnv() {
  try {
    for (const line of fs.readFileSync(path.resolve(process.cwd(), '.env'), 'utf-8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!process.env[m[1]]) process.env[m[1]] = v;
    }
  } catch {}
})();

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const SEASON_YEAR = parseInt(arg('season', '2026'), 10);
const TEAM_FILTER = arg('team') ? parseInt(arg('team'), 10) : null;
const EXECUTE = process.argv.includes('--execute');
const KEY = process.env.API_FOOTBALL_KEY;
const BASE = process.env.API_FOOTBALL_BASE_URL || 'https://v3.football.api-sports.io';
if (!KEY) { console.error('Missing API_FOOTBALL_KEY'); process.exit(1); }

const stripAccents = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const norm = (s) => stripAccents(s).replace(/[.,'"`\-]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
const tokensOf = (s) => norm(s).split(' ').filter((t) => t.length > 1);
const firstInitial = (s) => (norm(s)[0] || '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchSquad(teamAf) {
  const res = await fetch(`${BASE}/players/squads?team=${teamAf}`, { headers: { 'x-apisports-key': KEY } });
  const j = await res.json();
  return (j.response && j.response[0] && j.response[0].players) || [];
}

async function main() {
  console.log(`=== backfill-apifootball-ids — season=${SEASON_YEAR}${TEAM_FILTER ? ` team=${TEAM_FILTER}` : ''} ${EXECUTE ? '(EXECUTE)' : '(DRY RUN)'} ===\n`);
  const season = await prisma.season.findFirst({ where: { year: SEASON_YEAR }, select: { id: true } });
  if (!season) { console.error(`No ${SEASON_YEAR} season`); process.exit(1); }
  const teams = await prisma.team.findMany({
    where: { seasonId: season.id, apiFootballId: TEAM_FILTER ? TEAM_FILTER : { not: null } },
    select: { id: true, nameHe: true, nameEn: true, apiFootballId: true },
  });
  console.log(`Teams in scope: ${teams.length}\n`);

  const totals = { set: 0, ambiguous: 0, unmatched: 0, alreadyHad: 0 };
  for (const team of teams) {
    const squad = await fetchSquad(team.apiFootballId).catch(() => []);
    const players = await prisma.player.findMany({
      where: { teamId: team.id },
      select: { id: true, nameHe: true, nameEn: true, firstNameEn: true, lastNameEn: true, apiFootballId: true },
    });
    // surname-token → candidate records
    const index = new Map();
    for (const p of players) {
      for (const tok of new Set(tokensOf(p.lastNameEn || p.nameEn))) {
        if (!index.has(tok)) index.set(tok, []);
        index.get(tok).push(p);
      }
    }
    const takenApi = new Set(players.map((p) => p.apiFootballId).filter(Boolean));
    let set = 0, amb = 0, un = 0, had = 0;
    for (const ap of squad) {
      const toks = tokensOf(ap.name);
      if (!toks.length) continue;
      if (takenApi.has(ap.id)) { had++; continue; } // one of ours already owns this API id
      const cands = (index.get(toks[toks.length - 1]) || []).filter((c) => !c.apiFootballId);
      const withFi = cands.filter((c) => firstInitial(c.firstNameEn || c.nameEn) === firstInitial(ap.name));
      const pool = withFi.length ? withFi : cands;
      if (pool.length === 1) {
        console.log(`  ✓ ${team.nameHe}: ${ap.name} (af=${ap.id}) → ${pool[0].nameHe || pool[0].nameEn}`);
        if (EXECUTE) { await prisma.player.update({ where: { id: pool[0].id }, data: { apiFootballId: ap.id } }); }
        takenApi.add(ap.id);
        pool[0].apiFootballId = ap.id; // prevent re-use within this team
        set++;
      } else if (pool.length > 1) {
        console.log(`  ? ${team.nameHe}: ${ap.name} — AMBIGUOUS (${pool.length} candidates: ${pool.map((c) => c.nameHe).join(', ')}) — skipped`);
        amb++;
      } else {
        console.log(`  · ${team.nameHe}: ${ap.name} — no existing record (genuine new signing)`);
        un++;
      }
    }
    console.log(`  → ${team.nameHe}: set=${set} ambiguous=${amb} newSignings=${un} alreadyLinked=${had}\n`);
    totals.set += set; totals.ambiguous += amb; totals.unmatched += un; totals.alreadyHad += had;
    await sleep(250);
  }
  console.log(`=== Totals: set=${totals.set} ambiguous=${totals.ambiguous} newSignings=${totals.unmatched} alreadyLinked=${totals.alreadyHad} ===`);
  console.log(EXECUTE ? 'Mode: EXECUTE — written.' : 'Mode: DRY-RUN — pass --execute to apply.');
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error('FATAL', e.message); await prisma.$disconnect(); process.exit(1); });
