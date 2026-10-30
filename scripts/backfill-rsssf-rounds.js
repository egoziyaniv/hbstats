#!/usr/bin/env node
'use strict';
/**
 * backfill-rsssf-rounds.js — restore the round of pre-2000 league games imported from RSSSF.
 *
 * rebuild/60-historical.js created those games without their round (now fixed there), so
 * they could only be labelled by season. The round is still in scraped_matches
 * (source='rsssf'); this copies it to games.roundNameEn ("Round 12" → shown as "מחזור 12").
 *
 * Only touches Ligat HaAl games with no round, no apiFootballId and the 1 September
 * placeholder date. Never changes a date, score or team. See scripts/lib/rsssf-round-match.js
 * for how rows are paired with games.
 *
 * Usage:
 *   node scripts/backfill-rsssf-rounds.js            # dry run — counts + sample
 *   node scripts/backfill-rsssf-rounds.js --apply
 */
const fs = require('fs');
const path = require('path');

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

const { PrismaClient } = require('@prisma/client');
const { RSSSF_TO_HE, parseSeasonStartYear } = require('./lib/rsssf-teams');
const { planRoundBackfill } = require('./lib/rsssf-round-match');

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

(async () => {
  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} — RSSSF round backfill`);

  const scraped = await prisma.scrapedMatch.findMany({
    where: { source: 'rsssf', framework: 'league', round: { not: null } },
    select: { season: true, round: true, homeTeamName: true, awayTeamName: true, homeScore: true, awayScore: true },
  });
  const rows = scraped
    .map((m) => ({
      year: parseSeasonStartYear(m.season),
      homeNameHe: RSSSF_TO_HE[m.homeTeamName] || m.homeTeamName,
      awayNameHe: RSSSF_TO_HE[m.awayTeamName] || m.awayTeamName,
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      round: m.round,
    }))
    .filter((r) => r.year);
  console.log(`  scraped RSSSF league rows with a round: ${rows.length}`);

  const candidates = await prisma.game.findMany({
    where: {
      competitionId: 'comp_liga_haal',
      apiFootballId: null,
      roundNameEn: null,
      roundNameHe: null,
    },
    select: {
      id: true, dateTime: true, homeScore: true, awayScore: true,
      season: { select: { year: true } },
      homeTeam: { select: { nameHe: true } },
      awayTeam: { select: { nameHe: true } },
    },
  });
  // Seasons RSSSF has rounds for; undated Walla games in other seasons are not ours to match.
  const rsssfYears = new Set(rows.map((r) => r.year));
  const games = candidates
    .filter((g) => g.dateTime.toISOString().slice(5) === '09-01T00:00:00.000Z' && rsssfYears.has(g.season.year))
    .map((g) => ({
      id: g.id, year: g.season.year,
      homeNameHe: g.homeTeam.nameHe, awayNameHe: g.awayTeam.nameHe,
      homeScore: g.homeScore, awayScore: g.awayScore,
    }));
  console.log(`  round-less placeholder-dated Ligat HaAl games: ${games.length}`);

  const { updates, skipped } = planRoundBackfill(rows, games);
  console.log(`  ${APPLY ? 'updating' : 'would update'}: ${updates.length}, skipped keys: ${skipped.length}`);
  for (const s of skipped.slice(0, 15)) console.log(`    SKIP ${s.key}  (rsssf rows ${s.rows}, games ${s.games})`);
  if (skipped.length > 15) console.log(`    … ${skipped.length - 15} more`);
  if (!APPLY) {
    for (const u of updates.slice(0, 5)) console.log(`    e.g. ${u.gameId} -> ${u.roundNameEn}`);
    console.log('\nDry run — re-run with --apply to write.');
  } else {
    for (const u of updates) {
      await prisma.game.update({ where: { id: u.gameId }, data: { roundNameEn: u.roundNameEn } });
    }
    console.log('  done');
  }
  await prisma.$disconnect();
})().catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
