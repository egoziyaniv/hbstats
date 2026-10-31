#!/usr/bin/env node
'use strict';
/**
 * Two whole Ligat Ha'Al seasons (2008/09, 2009/10) were imported as Toto Cup games. They are
 * the Toto Cup games with a numbered league round ("מחזור 17") — the cup's own games carry a
 * group or a stage ("מחזור בית א'", "רבע גמר"). They move back to the league.
 * Games the archive import created are left alone (those are the cup's).
 *
 *
 * --no-competition: the IFA import of 2006-09 wrote rounds 1-22 of both leagues with no
 * competition at all. A numbered-round game whose two teams are both in that season's
 * Ligat Ha'Al (or Leumit) table goes to that league — unless the league already holds the
 * same game (same teams, same day), which is then reported, not moved.
 *
 * Ledger: data_import_changes, source 'league-misfiled-fix'; undo with
 *   node scripts/eyal-archive/rollback.js --source league-misfiled-fix --all --apply
 *
 * Usage: node scripts/fix-misfiled-league-seasons.js [--apply]
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

const SOURCE = 'league-misfiled-fix';
const SEASONS = [2008, 2009];
const FROM = 'comp_toto_cup_al';
const TO = 'comp_liga_haal';
const APPLY = process.argv.includes('--apply');
const NO_COMPETITION = process.argv.includes('--no-competition');
const prisma = new PrismaClient();

async function noCompetitionPlan() {
  const games = (await prisma.game.findMany({
    where: { competitionId: null, season: { year: { gte: 2000, lte: 2010 } } },
    select: { id: true, seasonId: true, homeTeamId: true, awayTeamId: true, dateTime: true, roundNameHe: true, season: { select: { year: true } } },
  })).filter((g) => /^מחזור \d+$/.test(g.roundNameHe || ''));
  const tables = await prisma.standing.findMany({
    where: { seasonId: { in: [...new Set(games.map((g) => g.seasonId))] }, competitionId: { in: ['comp_liga_haal', 'comp_liga_leumit'] } },
    select: { seasonId: true, teamId: true, competitionId: true },
  });
  const leagueOf = new Map(tables.map((t) => [`${t.seasonId}|${t.teamId}`, t.competitionId]));
  const held = await prisma.game.findMany({
    where: { seasonId: { in: [...new Set(games.map((g) => g.seasonId))] }, competitionId: { in: ['comp_liga_haal', 'comp_liga_leumit'] } },
    select: { homeTeamId: true, awayTeamId: true, dateTime: true },
  });
  const day = (d) => d.toISOString().slice(0, 10);
  const heldKeys = new Set(held.map((g) => `${g.homeTeamId}|${g.awayTeamId}|${day(g.dateTime)}`));
  const move = [];
  const report = { duplicate: 0, 'teams-not-in-one-league': 0 };
  for (const g of games) {
    const a = leagueOf.get(`${g.seasonId}|${g.homeTeamId}`);
    const b = leagueOf.get(`${g.seasonId}|${g.awayTeamId}`);
    if (!a || a !== b) { report['teams-not-in-one-league'] += 1; continue; }
    if (heldKeys.has(`${g.homeTeamId}|${g.awayTeamId}|${day(g.dateTime)}`)) { report.duplicate += 1; continue; }
    move.push({ id: g.id, year: g.season.year, to: a });
  }
  return { move, report };
}

(async () => {
  if (NO_COMPETITION) {
    const { move, report } = await noCompetitionPlan();
    const per = {};
    for (const m of move) per[`${m.year} ${m.to}`] = (per[`${m.year} ${m.to}`] || 0) + 1;
    console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} — league games with no competition:`, per, '; left alone', report);
    if (!APPLY) { console.log('\nDry run — re-run with --apply.'); await prisma.$disconnect(); return; }
    const batchId = `${SOURCE}-nocomp-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    for (const m of move) {
      await prisma.$transaction([
        prisma.game.update({ where: { id: m.id }, data: { competitionId: m.to } }),
        prisma.dataImportChange.create({ data: { source: SOURCE, batchId, table: 'games', recordId: m.id, field: 'competitionId', newValue: m.to, basis: 'league-without-competition' } }),
      ]);
    }
    await prisma.mergeOperation.create({
      data: {
        source: SOURCE, mergeType: 'cleanup', status: 'executed', executedAt: new Date(),
        description: `League games with no competition (2006-09) into their league (batch ${batchId})`,
        changesJson: { batchId, moved: move.length, per, report }, recordsMatched: move.length, recordsUpdated: move.length, recordsCreated: 0,
      },
    });
    console.log(`\nmoved ${move.length} games — batch ${batchId}`);
    await prisma.$disconnect();
    return;
  }
  const created = new Set((await prisma.dataImportChange.findMany({ where: { table: 'games', field: '*created*' }, select: { recordId: true } })).map((c) => c.recordId));
  const games = (await prisma.game.findMany({
    where: { season: { year: { in: SEASONS } }, competitionId: FROM },
    select: { id: true, roundNameHe: true, season: { select: { year: true } } },
  })).filter((g) => /^מחזור \d+$/.test(g.roundNameHe || '') && !created.has(g.id));
  const per = {};
  for (const g of games) per[g.season.year] = (per[g.season.year] || 0) + 1;
  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} — league games filed as Toto Cup:`, per);
  if (!APPLY) { console.log('\nDry run — re-run with --apply.'); await prisma.$disconnect(); return; }

  const batchId = `${SOURCE}-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  for (const g of games) {
    await prisma.$transaction([
      prisma.game.update({ where: { id: g.id }, data: { competitionId: TO } }),
      prisma.dataImportChange.create({ data: { source: SOURCE, batchId, table: 'games', recordId: g.id, field: 'competitionId', oldValue: FROM, newValue: TO, basis: 'league-filed-as-cup' } }),
    ]);
  }
  await prisma.mergeOperation.create({
    data: {
      source: SOURCE, mergeType: 'cleanup', status: 'executed', executedAt: new Date(),
      description: `Ligat Ha'Al 2008-10 games out of the Toto Cup (batch ${batchId})`,
      changesJson: { batchId, moved: games.length, per }, recordsMatched: games.length, recordsUpdated: games.length, recordsCreated: 0,
    },
  });
  console.log(`\nmoved ${games.length} games to the league — batch ${batchId}`);
  await prisma.$disconnect();
})().catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
