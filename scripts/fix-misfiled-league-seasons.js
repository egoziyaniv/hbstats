#!/usr/bin/env node
'use strict';
/**
 * Two whole Ligat Ha'Al seasons (2008/09, 2009/10) were imported as Toto Cup games. They are
 * the Toto Cup games with a numbered league round ("מחזור 17") — the cup's own games carry a
 * group or a stage ("מחזור בית א'", "רבע גמר"). They move back to the league.
 * Games the archive import created are left alone (those are the cup's).
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
const prisma = new PrismaClient();

(async () => {
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
