#!/usr/bin/env node
'use strict';
/**
 * refresh-fixture-schedule.js — keep stored kickoff times in step with reality.
 *
 * Why this exists: the season fixture list is imported months ahead, when the league has
 * only published a round's date, so every game in a round lands on one placeholder slot
 * (all seven round-4 games at 2026-09-14T17:00). The league later staggers them across
 * Saturday/Sunday/Monday at 16:45-17:30 — and nothing re-read the schedule, so our rows
 * kept the placeholder.
 *
 * That silently broke the whole live pipeline for round 3: matchday-live.js watches a
 * window around each kickoff, so it opened the window on Saturday for four games actually
 * played on Monday (the log shows "7 fixture(s) in window" on a day only three were
 * played), and by Monday it believed they were long past. cron-matchday.sh only ever
 * looks at today, so nothing revisited them either. Monday's results, events, lineups and
 * per-player statistics were never collected until someone refreshed by hand.
 *
 * The same payload also carries the status and score, so this reconciles finished games
 * whose result we never stored — the three Liga Leumit games of 2026-09-07 sat SCHEDULED
 * with no score because our rows had them a day early and nothing looked there again.
 *
 * Two API calls per league per run, so it is cheap enough to run daily.
 *
 * Usage:
 *   node scripts/refresh-fixture-schedule.js                 # current season, both leagues
 *   node scripts/refresh-fixture-schedule.js --season 2026
 *   node scripts/refresh-fixture-schedule.js --league 383
 *   node scripts/refresh-fixture-schedule.js --dry-run
 */
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf-8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(k in process.env)) process.env[k] = v;
  }
}
loadEnv(path.resolve(__dirname, '..', '.env'));

const prisma = new PrismaClient();
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const DRY = process.argv.includes('--dry-run');
// Ligat HaAl + Liga Leumit, the two leagues cron-matchday.sh already refreshes.
const LEAGUES = arg('league', null) ? [Number(arg('league'))] : [383, 382];

// Season start year: from July onwards the new season has begun.
function currentSeason() {
  const now = new Date();
  return now.getUTCMonth() + 1 >= 7 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}
const SEASON = Number(arg('season', currentSeason()));

async function fetchFixtures(leagueId, season) {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) throw new Error('API_FOOTBALL_KEY missing from .env');
  const base = process.env.API_FOOTBALL_BASE_URL || 'https://v3.football.api-sports.io';
  const res = await fetch(`${base}/fixtures?league=${leagueId}&season=${season}`, {
    headers: { 'x-apisports-key': key },
  });
  if (!res.ok) throw new Error(`fixtures ${leagueId}/${season}: ${res.status} ${await res.text()}`);
  const body = await res.json();
  return Array.isArray(body.response) ? body.response : [];
}

(async () => {
  console.log(`═══ ${new Date().toISOString()} — fixture schedule refresh (season ${SEASON}) ═══`);
  let moved = 0;
  let scored = 0;
  let checked = 0;
  let missing = 0;

  for (const leagueId of LEAGUES) {
    let fixtures;
    try {
      fixtures = await fetchFixtures(leagueId, SEASON);
    } catch (e) {
      console.log(`[league ${leagueId}] FAILED: ${e.message}`);
      continue;
    }
    console.log(`\nleague ${leagueId}: ${fixtures.length} fixtures from API-Football`);

    for (const f of fixtures) {
      const apiId = f.fixture?.id;
      const iso = f.fixture?.date;
      if (!apiId || !iso) continue;
      const kickoff = new Date(iso);
      if (Number.isNaN(kickoff.getTime())) continue;

      const game = await prisma.game.findUnique({
        where: { apiFootballId: apiId },
        select: { id: true, dateTime: true, status: true, homeScore: true, awayScore: true },
      });
      if (!game) { missing++; continue; }
      checked++;

      const data = {};
      const label = `${f.teams?.home?.name} vs ${f.teams?.away?.name}`;

      // Sub-minute drift is noise; anything more is a real reschedule.
      if (Math.abs(game.dateTime.getTime() - kickoff.getTime()) >= 60_000) {
        console.log(
          `  ${DRY ? 'WOULD MOVE' : 'MOVE'} ${apiId}: ` +
          `${game.dateTime.toISOString().slice(0, 16)} -> ${kickoff.toISOString().slice(0, 16)}  ${label}`,
        );
        data.dateTime = kickoff;
        moved++;
      }

      // Reconcile a finished result we never recorded. Only ever fills a gap: a score we
      // already hold is left alone, since the richer sources (IFA / FotMob) may have
      // corrected it.
      const short = String(f.fixture?.status?.short || '').toUpperCase();
      const finished = ['FT', 'AET', 'PEN'].includes(short);
      const hg = f.goals?.home;
      const ag = f.goals?.away;
      if (finished && typeof hg === 'number' && typeof ag === 'number' &&
          (game.homeScore === null || game.awayScore === null || game.status !== 'COMPLETED')) {
        console.log(
          `  ${DRY ? 'WOULD SCORE' : 'SCORE'} ${apiId}: ${game.status} ${game.homeScore}:${game.awayScore}` +
          ` -> COMPLETED ${hg}:${ag}  ${label}`,
        );
        if (game.homeScore === null) data.homeScore = hg;
        if (game.awayScore === null) data.awayScore = ag;
        data.status = 'COMPLETED';
        data.statusShort = short;
        data.statusLong = f.fixture?.status?.long ?? null;
        scored++;
      }

      if (!DRY && Object.keys(data).length) {
        await prisma.game.update({ where: { id: game.id }, data });
      }
    }
  }

  console.log(
    `\n${DRY ? 'DRY RUN' : 'DONE'} — matched ${checked} fixtures, rescheduled ${moved},` +
    ` results filled ${scored}, ${missing} API fixtures not in our DB`,
  );
  await prisma.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
