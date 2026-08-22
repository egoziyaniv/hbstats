#!/usr/bin/env node
/**
 * matchday-live.js — near-real-time matchday refresh.
 *
 * Designed for a 30-min cron. It does REAL work only when an Israeli-team
 * fixture is in the live window (kickoff − PRE_MIN .. kickoff + POST_HOURS ≈ 2h
 * before kickoff .. ~3h after full-time); otherwise it exits instantly with zero
 * API calls. Covers Israeli domestic (comp_*) AND Israeli teams' European /
 * friendly ties. When a fixture is in-window it runs the FAST matchday-update
 * pass — API-Football lineups / events / statistics / status → canonical, with
 * every Puppeteer scrape disabled — so lineups appear pre-kickoff and the box
 * score fills within minutes of the final whistle, plus a free FotMob pass (xG /
 * shot map / momentum / player ratings / attendance) for mapped clubs.
 *
 * The nightly heavy matchday-update (cron-matchday.sh) still backfills the
 * slow sources afterwards: IFA (Hebrew events/lineups/refs), FootyStats (xG),
 * Sofascore (ratings/coaches), Flashscore enrichment.
 *
 * Cup / Super Cup fixtures API-Football doesn't cover keep their
 * Sofascore-imported lineups — the fast pass no longer wipes canonical rows
 * when API-Football returns nothing (see matchday-update.js projectToCanonical).
 *
 * Usage:
 *   node scripts/matchday-live.js            # run (spawns fast matchday-update if in window)
 *   node scripts/matchday-live.js --dry-run  # just report what's in window
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

const DRY = process.argv.includes('--dry-run');
const PRE_MIN = 120;     // start 2h before kickoff (predicted / confirmed lineups)
const POST_HOURS = 5;    // keep going ~5h after kickoff (≈ 3h after a normal FT)

async function main() {
  const now = new Date();
  const from = new Date(now.getTime() - POST_HOURS * 3600 * 1000);
  const to = new Date(now.getTime() + PRE_MIN * 60 * 1000);

  // Israeli clubs = teams that appear in an Israeli-competition (comp_*) standing.
  const israeliTeams = await prisma.team.findMany({
    where: { apiFootballId: { not: null }, standings: { some: { competition: { id: { startsWith: 'comp_' } } } } },
    select: { apiFootballId: true },
    distinct: ['apiFootballId'],
  });
  const israeliApiIds = new Set(israeliTeams.map((t) => t.apiFootballId));

  // Any in-window fixture in an Israeli competition (comp_*) OR involving an
  // Israeli club — the latter picks up European / friendly ties (cuid comp ids).
  const inWindow = await prisma.game.findMany({
    where: { dateTime: { gte: from, lte: to } },
    select: {
      id: true, dateTime: true, status: true, competitionId: true,
      homeTeam: { select: { nameHe: true, apiFootballId: true } },
      awayTeam: { select: { nameHe: true, apiFootballId: true } },
    },
    orderBy: { dateTime: 'asc' },
  });
  const games = inWindow.filter((g) =>
    (g.competitionId && g.competitionId.startsWith('comp_')) ||
    (g.homeTeam.apiFootballId != null && israeliApiIds.has(g.homeTeam.apiFootballId)) ||
    (g.awayTeam.apiFootballId != null && israeliApiIds.has(g.awayTeam.apiFootballId))
  );

  if (!games.length) {
    console.log(`[${now.toISOString()}] no Israeli fixture in window — skip (0 API calls)`);
    await prisma.$disconnect();
    return;
  }

  console.log(`[${now.toISOString()}] ${games.length} fixture(s) in window:`);
  for (const g of games) {
    console.log(`  ${g.dateTime.toISOString().slice(11, 16)}  ${g.homeTeam.nameHe} v ${g.awayTeam.nameHe}  [${g.status}]`);
  }
  const dates = [...new Set(games.map((g) => g.dateTime.toISOString().slice(0, 10)))];

  if (DRY) { console.log(`[dry-run] would run fast matchday-update for: ${dates.join(', ')}`); await prisma.$disconnect(); return; }

  let failed = 0;
  for (const d of dates) {
    console.log(`\n→ fast matchday-update --date ${d} (API-Football only)`);
    const r = spawnSync('node', [
      'scripts/matchday-update.js', '--date', d, '--league', 'all',
      '--no-footystats', '--no-walla', '--no-ifa', '--no-sofascore', '--no-merge',
    ], { stdio: 'inherit', cwd: path.resolve(__dirname, '..') });
    if (r.status !== 0) { failed++; console.error(`  ✗ matchday-update failed for ${d}`); }
  }

  // FotMob pass (free — no Cloudflare / token / Firecrawl credits): xG, shot map,
  // momentum, player ratings, attendance/weather for in-window games whose club
  // has a FotMob mapping. Keep FM_TEAMS in sync with scrape-fotmob.js AF_TO_FM.
  const FM_TEAMS = new Set([657, 4481, 563, 2253, 4486, 4488, 4489, 4501, 4510, 4195, 4505, 4495, 604, 6181]);
  for (const g of games) {
    if (!FM_TEAMS.has(g.homeTeam.apiFootballId) && !FM_TEAMS.has(g.awayTeam.apiFootballId)) continue;
    console.log(`\n→ FotMob: ${g.homeTeam.nameHe} v ${g.awayTeam.nameHe}`);
    const r = spawnSync('node', ['scripts/scrape-fotmob.js', '--game', g.id], { stdio: 'inherit', cwd: path.resolve(__dirname, '..') });
    if (r.status !== 0) console.error('  ✗ FotMob failed (continuing)');
  }

  // Sofascore stats + shot map (Firecrawl, ~1 credit/game). Sofascore covers the
  // Israeli league with a 46-metric panel + shot map that FotMob and API-Football
  // lack for these games. Run ONCE per game post-FT — skip once a shotmap is
  // stored — so it's ~1 credit/game/matchday, not every 30 min.
  if (process.env.FIRECRAWL_API_KEY) {
    for (const g of games) {
      if (g.status !== 'COMPLETED') continue;
      const have = await prisma.sofascoreMatchStats.findUnique({ where: { gameId: g.id }, select: { shotmap: true } });
      if (have && Array.isArray(have.shotmap) && have.shotmap.length) continue;
      console.log(`\n→ Sofascore stats+shotmap: ${g.homeTeam.nameHe} v ${g.awayTeam.nameHe}`);
      const r = spawnSync('node', ['scripts/scrape-sofascore-shotmap.js', '--game', g.id], { stdio: 'inherit', cwd: path.resolve(__dirname, '..') });
      if (r.status !== 0) console.error('  ✗ Sofascore stats failed (continuing)');
    }
  }

  // Cup / Super Cup fixtures API-Football doesn't cover: pull from Sofascore
  // (event id resolved from a team's schedule; ~2 Firecrawl calls each). League
  // lineups come from API-Football, so skip those; only Sofascore-mapped clubs
  // resolve. We run when we lack the FULL squad (no substitute rows — these cups
  // give us starters only, from IFA, and never a bench) OR when the game was
  // decided on penalties but we don't have the shootout tally yet (API-Football
  // sets status=PEN but leaves it null). Both conditions self-limit: once the
  // importer writes SUBSTITUTE rows / the penalties land, they're false and we
  // stop — and the whole loop only sees in-window fixtures anyway.
  const LEAGUE_COMPS = new Set(['comp_liga_haal', 'comp_liga_leumit']);
  const SS_RESOLVABLE = new Set([657, 4481, 563, 2253, 4510, 4486, 4488, 4489, 4501, 6181, 4195, 4495, 4505, 604]);
  if (process.env.FIRECRAWL_API_KEY) {
    for (const g of games) {
      if (LEAGUE_COMPS.has(g.competitionId)) continue;
      if (!SS_RESOLVABLE.has(g.homeTeam.apiFootballId) && !SS_RESOLVABLE.has(g.awayTeam.apiFootballId)) continue;
      const subCnt = await prisma.gameLineupEntry.count({ where: { gameId: g.id, role: 'SUBSTITUTE' } });
      const det = await prisma.game.findUnique({ where: { id: g.id }, select: { statusShort: true, homePenalty: true, awayPenalty: true } });
      const needSquad = subCnt === 0;
      const needPens = !!det && det.statusShort === 'PEN' && (det.homePenalty == null || det.awayPenalty == null);
      if (!needSquad && !needPens) continue;
      const why = [needSquad ? 'no full squad' : null, needPens ? 'shootout tally missing' : null].filter(Boolean).join(' + ');
      console.log(`\n→ Sofascore fallback: ${g.homeTeam.nameHe} v ${g.awayTeam.nameHe} (${why})`);
      const r = spawnSync('node', ['scripts/scrape-sofascore-lineups.js', '--game', g.id], { stdio: 'inherit', cwd: path.resolve(__dirname, '..') });
      if (r.status !== 0) console.error('  ✗ Sofascore fallback failed (continuing)');
    }
  }

  await prisma.$disconnect();
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e.message); prisma.$disconnect(); process.exit(1); });
