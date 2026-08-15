#!/usr/bin/env node
/**
 * fix-leumit-names.js — improve rough Hebrew names for current-season Liga
 * Leumit squad players. The squad endpoint returns abbreviated names ("M.
 * Cohen") → transliteration gives a 1-char first name ("מ כהן"). Here we fetch
 * the player's FULL name from API-Football's /players/profiles and re-
 * transliterate, so the first name is complete.
 *
 * Only touches current-season Liga Leumit players whose nameHe first token is a
 * single char (rough), and only writes when the fetched full name yields a
 * proper (>=2 char) first name.
 *
 * Usage: node scripts/fix-leumit-names.js [--execute]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { translateName } = require('./transliterate-players.js');

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

const EXECUTE = process.argv.includes('--execute');
const KEY = process.env.API_FOOTBALL_KEY;
const BASE = process.env.API_FOOTBALL_BASE_URL || 'https://v3.football.api-sports.io';
function defaultSeasonYear() { const now = new Date(); return now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1; }
const SEASON_YEAR = defaultSeasonYear();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchProfile(af) {
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(`${BASE}/players/profiles?player=${af}`, { headers: { 'x-apisports-key': KEY } });
      const j = await res.json();
      const p = j?.response?.[0]?.player;
      if (p) return p;
    } catch {}
    await sleep(400);
  }
  return null;
}

async function main() {
  console.log(`=== fix-leumit-names season=${SEASON_YEAR} ${EXECUTE ? '(EXECUTE)' : '(DRY)'} ===`);
  const s = await prisma.season.findFirst({ where: { year: SEASON_YEAR }, select: { id: true } });
  const teams = await prisma.team.findMany({ where: { seasonId: s.id, standings: { some: { competitionId: 'comp_liga_leumit' } } }, select: { id: true } });
  const players = await prisma.player.findMany({
    where: { teamId: { in: teams.map((t) => t.id) }, apiFootballId: { not: null } },
    select: { id: true, nameHe: true, nameEn: true, apiFootballId: true, canonicalPlayerId: true },
  });
  const rough = players.filter((p) => (p.nameHe || '').trim().split(/\s+/)[0].length === 1);
  console.log(`Leumit players: ${players.length} | rough (1-char first name): ${rough.length}\n`);

  let fixed = 0;
  for (const p of rough) {
    const prof = await fetchProfile(p.apiFootballId);
    await sleep(300);
    if (!prof) { console.log(`  · ${p.nameHe} (af=${p.apiFootballId}) — no profile`); continue; }
    const he = translateName(prof.firstname, prof.lastname, prof.name);
    const firstTok = (he || '').split(/\s+/)[0] || '';
    if (!/[֐-׿]/.test(he) || firstTok.length < 2) { console.log(`  · ${p.nameHe} → "${he}" (still rough — skip)`); continue; }
    if (he === p.nameHe) continue;
    console.log(`  ✓ "${p.nameHe}" → "${he}"  [${prof.firstname} ${prof.lastname}]`);
    if (EXECUTE) {
      await prisma.player.update({ where: { id: p.id }, data: { nameHe: he } }).catch(() => {});
      if (p.canonicalPlayerId) await prisma.player.update({ where: { id: p.canonicalPlayerId }, data: { nameHe: he } }).catch(() => {});
    }
    fixed++;
  }
  console.log(`\n${EXECUTE ? 'Fixed' : 'Would fix'} ${fixed} of ${rough.length} rough names.`);
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error('FATAL', e.message); await prisma.$disconnect(); process.exit(1); });
