#!/usr/bin/env node
/**
 * prune-departed-squad.js — remove players left stale in their OLD team's
 * current-season squad after a transfer. sync-squads adds transferred-IN
 * players but never removes transferred-OUT ones ("kept: 0"), so e.g. a player
 * who moved Beer Sheva → Hapoel Haifa lingers in both. This prunes the stale
 * old-team record when API-Football no longer lists the player in that team.
 *
 * Safe: current season only; only records with an apiFootballId that is NOT in
 * the team's CURRENT API squad; only when the record has NO game data (lineups/
 * events) for this season (a player who actually played for the old team is
 * kept). Canonical back-references are repointed to the player's surviving
 * same-apiFootballId record before deletion; playerStats cascade-delete.
 *
 * Usage: node scripts/prune-departed-squad.js [--league 383|382|all] [--execute]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

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
const EXECUTE = process.argv.includes('--execute');
const LEAGUE = arg('league', 'all');
const KEY = process.env.API_FOOTBALL_KEY;
const BASE = process.env.API_FOOTBALL_BASE_URL || 'https://v3.football.api-sports.io';
function defaultSeasonYear() { const now = new Date(); return now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1; }
const SEASON_YEAR = defaultSeasonYear();
const COMPS = LEAGUE === '383' ? ['comp_liga_haal'] : LEAGUE === '382' ? ['comp_liga_leumit'] : ['comp_liga_haal', 'comp_liga_leumit'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function apiSquadAfIds(teamAf) {
  try {
    const res = await fetch(`${BASE}/players/squads?team=${teamAf}`, { headers: { 'x-apisports-key': KEY } });
    const j = await res.json();
    const players = j?.response?.[0]?.players || [];
    return new Set(players.map((p) => p.id));
  } catch { return null; }
}

async function main() {
  console.log(`=== prune-departed-squad season=${SEASON_YEAR} league=${LEAGUE} ${EXECUTE ? '(EXECUTE)' : '(DRY)'} ===\n`);
  const season = await prisma.season.findFirst({ where: { year: SEASON_YEAR }, select: { id: true } });
  const teams = await prisma.team.findMany({
    where: { seasonId: season.id, apiFootballId: { not: null }, standings: { some: { competitionId: { in: COMPS } } } },
    select: { id: true, nameHe: true, apiFootballId: true },
  });

  // Global map: which team(s) CURRENTLY list each player-af, per API squads.
  // Prune from an old team ONLY when the player is confirmed in ANOTHER Israeli
  // team's current squad (a real transfer) — never on mere absence, which can
  // be API squad incompleteness (e.g. it briefly dropped a keeper who's still
  // on the team).
  const afToTeamAf = new Map(); // playerAf -> Set(teamApiFootballId)
  const squadByTeam = new Map(); // teamApiFootballId -> Set(playerAf)
  for (const team of teams) {
    const afSet = await apiSquadAfIds(team.apiFootballId);
    await sleep(250);
    squadByTeam.set(team.apiFootballId, afSet);
    if (!afSet) continue;
    for (const af of afSet) { if (!afToTeamAf.has(af)) afToTeamAf.set(af, new Set()); afToTeamAf.get(af).add(team.apiFootballId); }
  }

  let pruned = 0, keptPlayed = 0, keptUnconfirmed = 0;
  for (const team of teams) {
    const afSet = squadByTeam.get(team.apiFootballId);
    if (!afSet || afSet.size === 0) { console.log(`  · ${team.nameHe}: no API squad — skip (safety)`); continue; }
    const players = await prisma.player.findMany({
      where: { teamId: team.id, apiFootballId: { not: null } },
      select: { id: true, nameHe: true, nameEn: true, apiFootballId: true, canonicalPlayerId: true },
    });
    for (const p of players) {
      if (afSet.has(p.apiFootballId)) continue; // still in THIS team's current squad
      // Only prune if confirmed in ANOTHER Israeli team's current squad.
      const elsewhere = [...(afToTeamAf.get(p.apiFootballId) || [])].filter((t) => t !== team.apiFootballId);
      if (elsewhere.length === 0) { console.log(`  ? ${team.nameHe}: KEEP ${p.nameHe} (dropped from squad but not found elsewhere — unconfirmed)`); keptUnconfirmed++; continue; }
      // has this record any game data this season? (played for the old team)
      const [ln, ev] = await Promise.all([
        prisma.gameLineupEntry.count({ where: { playerId: p.id, game: { seasonId: season.id } } }),
        prisma.gameEvent.count({ where: { game: { seasonId: season.id }, OR: [{ playerId: p.id }, { relatedPlayerId: p.id }] } }),
      ]);
      if (ln > 0 || ev > 0) { console.log(`  = ${team.nameHe}: KEEP ${p.nameHe} (played ${ln}ln/${ev}ev this season)`); keptPlayed++; continue; }
      console.log(`  ✗ ${team.nameHe}: prune ${p.nameHe} / ${p.nameEn} (af=${p.apiFootballId}, transferred out)`);
      if (EXECUTE) {
        // repoint canonical back-refs to a surviving same-af record (their new team), else self
        const survivor = await prisma.player.findFirst({ where: { apiFootballId: p.apiFootballId, id: { not: p.id } }, select: { id: true, canonicalPlayerId: true } });
        const newCanon = survivor ? (survivor.canonicalPlayerId || survivor.id) : null;
        if (newCanon) await prisma.player.updateMany({ where: { canonicalPlayerId: p.id, id: { not: p.id } }, data: { canonicalPlayerId: newCanon } });
        await prisma.player.delete({ where: { id: p.id } }).catch((e) => console.error(`    delete err: ${e.message?.split('\n')[0]}`));
      }
      pruned++;
    }
  }
  console.log(`\n${EXECUTE ? 'Pruned' : 'Would prune'} ${pruned} departed (confirmed elsewhere) | kept ${keptPlayed} that played | kept ${keptUnconfirmed} unconfirmed (still shown).`);
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error('FATAL', e.message); await prisma.$disconnect(); process.exit(1); });
