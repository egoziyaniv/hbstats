#!/usr/bin/env node
/**
 * audit-squads.js — compare each current-season Israeli team's DB squad to
 * API-Football's CURRENT /players/squads, both directions. Read-only report to
 * surface remaining discrepancies after backfill/sync/prune:
 *   - MISSING ARRIVALS: in the API squad but not in our DB team (sync gap).
 *   - DB-ONLY (af): a player with apiFootballId in our team but not in the API
 *     squad — split into "confirmed elsewhere" (a real transfer the prune would
 *     catch) vs "unconfirmed" (API dropped them / went abroad).
 *
 * Usage: node scripts/audit-squads.js [--league 383|382|all]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(function loadEnv() { try { for (const line of fs.readFileSync(path.resolve(process.cwd(), '.env'), 'utf-8').split('\n')) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (!m) continue; let v = m[2]; if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1); if (!process.env[m[1]]) process.env[m[1]] = v; } } catch {} })();

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const LEAGUE = arg('league', 'all');
const KEY = process.env.API_FOOTBALL_KEY;
const BASE = process.env.API_FOOTBALL_BASE_URL || 'https://v3.football.api-sports.io';
function defaultSeasonYear() { const now = new Date(); return now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1; }
const SEASON_YEAR = defaultSeasonYear();
const COMPS = LEAGUE === '383' ? ['comp_liga_haal'] : LEAGUE === '382' ? ['comp_liga_leumit'] : ['comp_liga_haal', 'comp_liga_leumit'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function apiSquad(teamAf) {
  try { const res = await fetch(`${BASE}/players/squads?team=${teamAf}`, { headers: { 'x-apisports-key': KEY } }); const j = await res.json(); return j?.response?.[0]?.players || null; } catch { return null; }
}

async function main() {
  console.log(`=== audit-squads season=${SEASON_YEAR} league=${LEAGUE} ===\n`);
  const season = await prisma.season.findFirst({ where: { year: SEASON_YEAR }, select: { id: true } });
  const teams = await prisma.team.findMany({ where: { seasonId: season.id, apiFootballId: { not: null }, standings: { some: { competitionId: { in: COMPS } } } }, select: { id: true, nameHe: true, apiFootballId: true } });

  // global map of every af currently in ANY Israeli team's API squad
  const squads = new Map(); // teamAf -> players[]
  const afEverywhere = new Set();
  for (const t of teams) { const sq = await apiSquad(t.apiFootballId); await sleep(250); squads.set(t.apiFootballId, sq); (sq || []).forEach((p) => afEverywhere.add(p.id)); }

  let totMissing = 0, totDepartedConfirmed = 0, totDepartedUnconfirmed = 0;
  for (const t of teams) {
    const sq = squads.get(t.apiFootballId);
    if (!sq) { console.log(`  · ${t.nameHe}: no API squad`); continue; }
    const apiAfs = new Set(sq.map((p) => p.id));
    const dbPlayers = await prisma.player.findMany({ where: { teamId: t.id }, select: { nameHe: true, nameEn: true, apiFootballId: true } });
    const dbAfs = new Set(dbPlayers.map((p) => p.apiFootballId).filter(Boolean));
    const missing = sq.filter((p) => !dbAfs.has(p.id));
    const departed = dbPlayers.filter((p) => p.apiFootballId && !apiAfs.has(p.apiFootballId));
    const depConfirmed = departed.filter((p) => afEverywhere.has(p.apiFootballId));
    const depUnconfirmed = departed.filter((p) => !afEverywhere.has(p.apiFootballId));
    if (missing.length || depConfirmed.length) {
      console.log(`\n${t.nameHe} — API ${sq.length}, DB(af) ${dbAfs.size}`);
      if (missing.length) console.log(`  MISSING ARRIVALS (${missing.length}): ${missing.map((p) => p.name).join(', ')}`);
      if (depConfirmed.length) console.log(`  STALE→transferred (${depConfirmed.length}): ${depConfirmed.map((p) => p.nameHe).join(', ')}`);
    }
    totMissing += missing.length; totDepartedConfirmed += depConfirmed.length; totDepartedUnconfirmed += depUnconfirmed.length;
  }
  console.log(`\n=== TOTALS: missing arrivals=${totMissing} | stale-confirmed-transfers=${totDepartedConfirmed} | departed-unconfirmed(kept)=${totDepartedUnconfirmed} ===`);
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error('FATAL', e.message); await prisma.$disconnect(); process.exit(1); });
