#!/usr/bin/env node
/**
 * matchday-live.js — near-real-time matchday refresh.
 *
 * Designed for a frequent cron (e.g. every 10 min). It does REAL work only when
 * an Israeli fixture is in the live window (kickoff − PRE_MIN .. full-time +
 * POST_HOURS); otherwise it exits instantly with zero API calls. When a fixture
 * is in-window it runs the FAST matchday-update pass — API-Football lineups /
 * events / statistics / status → canonical, with every Puppeteer scrape
 * disabled — so lineups appear around kickoff and the box score fills within
 * minutes of the final whistle, instead of waiting for the nightly full run.
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
const PRE_MIN = 75;      // start refreshing this long before kickoff (lineups)
const POST_HOURS = 4;    // keep refreshing this long after kickoff (final stats settle)

async function main() {
  const now = new Date();
  const from = new Date(now.getTime() - POST_HOURS * 3600 * 1000);
  const to = new Date(now.getTime() + PRE_MIN * 60 * 1000);

  // Israeli competitions use canonical `comp_*` ids; friendlies/euro use cuids.
  const games = await prisma.game.findMany({
    where: { dateTime: { gte: from, lte: to }, competitionId: { startsWith: 'comp_' } },
    select: {
      id: true, dateTime: true, status: true,
      homeTeam: { select: { nameHe: true } }, awayTeam: { select: { nameHe: true } },
    },
    orderBy: { dateTime: 'asc' },
  });

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
  await prisma.$disconnect();

  if (DRY) { console.log(`[dry-run] would run fast matchday-update for: ${dates.join(', ')}`); return; }

  let failed = 0;
  for (const d of dates) {
    console.log(`\n→ fast matchday-update --date ${d} (API-Football only)`);
    const r = spawnSync('node', [
      'scripts/matchday-update.js', '--date', d, '--league', 'all',
      '--no-footystats', '--no-walla', '--no-ifa', '--no-sofascore', '--no-merge',
    ], { stdio: 'inherit', cwd: path.resolve(__dirname, '..') });
    if (r.status !== 0) { failed++; console.error(`  ✗ matchday-update failed for ${d}`); }
  }
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e.message); prisma.$disconnect(); process.exit(1); });
