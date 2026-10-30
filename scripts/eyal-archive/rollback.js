#!/usr/bin/env node
'use strict';
/**
 * Undo an Eyal Hatav archive import (scripts/eyal-archive/import.js), from its ledger.
 *
 *  - game fields go back to the value they had before — but only while they still hold the
 *    value the import wrote. A field edited by hand since is left alone and reported.
 *  - events the import created (source='eyal-archive') are deleted.
 *  - --raw also deletes the scraped_matches rows (source='eyal-archive').
 *
 * Usage:
 *   node scripts/eyal-archive/rollback.js --list
 *   node scripts/eyal-archive/rollback.js --batch <batchId>            # dry run
 *   node scripts/eyal-archive/rollback.js --batch <batchId> --apply
 *   node scripts/eyal-archive/rollback.js --all [--basis round-inferred] [--raw] --apply
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
const { SOURCE } = require('../lib/eyal-archive');

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : process.argv[i + 1];
};
const APPLY = process.argv.includes('--apply');
const BATCH = arg('--batch');
const ALL = process.argv.includes('--all');
const BASIS = arg('--basis');
const RAW = process.argv.includes('--raw');
const prisma = new PrismaClient();

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const asStored = (field, v) => (field === 'dateTime' && v ? new Date(v).toISOString() : v);

(async () => {
  if (process.argv.includes('--list')) {
    const batches = await prisma.dataImportChange.groupBy({
      by: ['batchId', 'table', 'basis'], where: { source: SOURCE }, _count: { _all: true },
    });
    for (const b of batches) console.log(`${b.batchId}  ${b.table}  ${b.basis}  ${b._count._all} changes`);
    await prisma.$disconnect();
    return;
  }
  if (!BATCH && !ALL) { console.error('--batch <id> | --all | --list'); process.exit(1); }

  const where = { source: SOURCE, ...(BATCH ? { batchId: BATCH } : {}), ...(BASIS ? { basis: BASIS } : {}) };
  const changes = await prisma.dataImportChange.findMany({ where, orderBy: { createdAt: 'desc' } });
  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} rollback — ${changes.length} ledger rows`);

  // Events: delete what the import created.
  const createdEvents = changes.filter((c) => c.table === 'game_events' && c.field === '*created*').map((c) => c.recordId);
  // Game fields: restore when untouched since.
  const gameChanges = changes.filter((c) => c.table === 'games');
  const gameIds = [...new Set(gameChanges.map((c) => c.recordId))];
  const games = new Map((await prisma.game.findMany({ where: { id: { in: gameIds } } })).map((g) => [g.id, g]));
  const restore = new Map();
  const restoredLedgerIds = [];
  const editedSince = [];
  for (const c of gameChanges) {
    const g = games.get(c.recordId);
    if (!g) continue;
    const current = c.field === 'dateTime' ? new Date(g[c.field]).toISOString() : g[c.field];
    if (!same(current, asStored(c.field, c.newValue))) { editedSince.push(`${c.recordId}.${c.field}`); continue; }
    const data = restore.get(c.recordId) || {};
    data[c.field] = c.field === 'dateTime' ? new Date(c.oldValue) : c.oldValue ?? null;
    restore.set(c.recordId, data);
    restoredLedgerIds.push(c.id);
  }
  // Event fields (the home/away swap flips `team`): restore when untouched since.
  const eventChanges = changes.filter((c) => c.table === 'game_events' && c.field !== '*created*');
  const eventsNow = new Map((await prisma.gameEvent.findMany({ where: { id: { in: eventChanges.map((c) => c.recordId) } }, select: { id: true, team: true } })).map((e) => [e.id, e]));
  const eventRestore = [];
  for (const c of eventChanges) {
    const e = eventsNow.get(c.recordId);
    if (e && same(e[c.field], c.newValue)) eventRestore.push(c);
    else if (e) editedSince.push(`${c.recordId}.${c.field}`);
  }
  console.log(`  games to restore: ${restore.size}, events to delete: ${createdEvents.length}, event fields to restore: ${eventRestore.length}, edited since import (kept): ${editedSince.length}`);
  for (const e of editedSince.slice(0, 10)) console.log(`    kept ${e}`);
  if (RAW) console.log(`  scraped rows to delete: ${await prisma.scrapedMatch.count({ where: { source: SOURCE } })}`);

  if (!APPLY) { console.log('\nDry run — re-run with --apply.'); await prisma.$disconnect(); return; }

  for (const [id, data] of restore) await prisma.game.update({ where: { id }, data });
  for (const c of eventRestore) await prisma.gameEvent.update({ where: { id: c.recordId }, data: { [c.field]: c.oldValue } });
  await prisma.gameEvent.deleteMany({ where: { id: { in: createdEvents }, source: SOURCE } });
  // Ledger rows of fields edited since stay, so the history of what the archive wrote is kept.
  const eventLedgerIds = [...changes.filter((c) => c.table === 'game_events' && c.field === '*created*'), ...eventRestore].map((c) => c.id);
  await prisma.dataImportChange.deleteMany({ where: { id: { in: [...restoredLedgerIds, ...eventLedgerIds] } } });
  if (RAW) await prisma.scrapedMatch.deleteMany({ where: { source: SOURCE } });
  console.log('  done');
  await prisma.$disconnect();
})().catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
