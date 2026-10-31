#!/usr/bin/env node
'use strict';
/**
 * Eyal Hatav's season summaries (its "seasons" sheet, 70 rows) onto Beer Sheva's team of each
 * season: who ran the club and who coached it ("יו״ר: רן פסח | מאמן: אליהו עופר, ויקו חדד"),
 * Beer Sheva's league that season, its place, and its record in all official games.
 * Stored as team.additionalInfo.eyalSeason; /club/seasons shows the staff line.
 *
 * Ledger: data_import_changes, source 'eyal-archive', basis 'season-summary' (the team's
 * additionalInfo before and after); rollback.js restores it.
 *
 * Usage: node scripts/eyal-archive/season-summaries.js --file <eyal-archive.json> [--apply]
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
loadEnv(path.resolve(__dirname, '..', '..', '.env'));

const { PrismaClient } = require('@prisma/client');
const A = require('../lib/eyal-archive');

const arg = (name) => { const i = process.argv.indexOf(name); return i === -1 ? null : process.argv[i + 1]; };
const FILE = arg('--file');
const APPLY = process.argv.includes('--apply');
const prisma = new PrismaClient();

/** "יו״ר: רן פסח | מאמן: אליהו עופר, ויקו חדד" → [{ roleHe: 'יו״ר', namesHe: 'רן פסח' }, ...]. */
function parseStaff(text) {
  return String(text || '').split('|').map((part) => part.trim()).filter(Boolean).map((part) => {
    const i = part.indexOf(':');
    return i === -1 ? { roleHe: '', namesHe: part } : { roleHe: part.slice(0, i).trim(), namesHe: part.slice(i + 1).replace(/\s+,/g, ',').trim() };
  });
}

(async () => {
  const archive = JSON.parse(fs.readFileSync(FILE, 'utf-8'));
  const rows = archive.seasons.filter((s) => A.seasonStartYear(s['עונה']));
  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} — ${A.SOURCE_LABEL_HE}: ${rows.length} season summaries`);

  const teams = await prisma.team.findMany({
    where: { OR: [{ apiFootballId: 563 }, { nameHe: 'הפועל באר שבע' }] },
    select: { id: true, additionalInfo: true, season: { select: { year: true } } },
  });
  const plan = [];
  const missing = [];
  for (const s of rows) {
    const year = A.seasonStartYear(s['עונה']);
    const summary = {
      season: s['עונה'],
      leagueHe: s['ליגה'] || null,
      level: s['רמת ליגה'] ?? null,
      place: s['מקום בליגה'] ?? null,
      staff: parseStaff(s['הנהלה ומאמן (כמקור)']),
      official: { played: s['משחקים רשמיים'], wins: s['ניצחונות'], draws: s['תיקו'], losses: s['הפסדים'], goalsFor: s['שערי זכות'], goalsAgainst: s['שערי חובה'] },
      ref: `seasons-r${s.row}`,
    };
    const mine = teams.filter((t) => t.season?.year === year);
    if (!mine.length) { missing.push(s['עונה']); continue; }
    for (const t of mine) {
      const info = t.additionalInfo && typeof t.additionalInfo === 'object' ? t.additionalInfo : {};
      if (JSON.stringify(info.eyalSeason) === JSON.stringify(summary)) continue;
      plan.push({ teamId: t.id, ref: summary.ref, oldValue: t.additionalInfo ?? null, newValue: { ...info, eyalSeason: summary } });
    }
  }
  console.log(`teams to update: ${plan.length}; seasons with no Beer Sheva team: ${missing.join(', ') || 'none'}`);
  for (const p of plan.slice(0, 4)) console.log(' ', JSON.stringify(p.newValue.eyalSeason));

  if (!APPLY) { console.log('\nDry run — re-run with --apply.'); await prisma.$disconnect(); return; }

  const batchId = `${A.SOURCE}-season-summaries-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  for (const p of plan) {
    await prisma.$transaction([
      prisma.team.update({ where: { id: p.teamId }, data: { additionalInfo: p.newValue } }),
      prisma.dataImportChange.create({ data: { source: A.SOURCE, batchId, table: 'teams', recordId: p.teamId, field: 'additionalInfo', oldValue: p.oldValue ?? undefined, newValue: p.newValue, basis: 'season-summary', sourceRef: p.ref } }),
    ]);
  }
  await prisma.mergeOperation.create({
    data: {
      source: A.SOURCE, mergeType: 'season-summaries', status: 'executed', executedAt: new Date(),
      description: `${A.SOURCE_LABEL_HE} — season summaries (batch ${batchId})`,
      changesJson: { batchId, teams: plan.length, missing }, recordsMatched: plan.length, recordsUpdated: plan.length, recordsCreated: 0,
    },
  });
  console.log(`\nupdated ${plan.length} teams — batch ${batchId}`);
  await prisma.$disconnect();
})().catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
