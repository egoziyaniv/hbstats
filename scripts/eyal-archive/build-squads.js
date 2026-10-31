#!/usr/bin/env node
'use strict';
/**
 * Beer Sheva squads for the seasons we hold no players for (before 2006): everyone the
 * archive names as a Beer Sheva scorer that season becomes a player of that season's team,
 * and their goals point at them. The rest of each squad is for other sources to fill.
 *
 *  - only a Beer Sheva team row with no players at all — a season with a squad is left to
 *    scripts/link-legacy-event-players.js, which matches names inside it;
 *  - one player per name per season; nothing is linked across seasons (the identity rule in
 *    the player-data notes: a name alone is not a person across teams);
 *  - own goals are skipped — that scorer played for the other side.
 *
 * Ledger: data_import_changes, source 'eyal-archive', basis 'squad-from-scorers';
 * rollback.js undoes it with the rest of the archive.
 *
 * Usage: node scripts/eyal-archive/build-squads.js [--apply]
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

const APPLY = process.argv.includes('--apply');
const prisma = new PrismaClient();

(async () => {
  const teams = await prisma.team.findMany({
    where: { OR: [{ apiFootballId: 563 }, { nameHe: 'הפועל באר שבע' }], players: { none: {} } },
    select: { id: true, season: { select: { year: true } } },
  });
  const events = await prisma.gameEvent.findMany({
    where: { teamId: { in: teams.map((t) => t.id) }, playerId: null, type: { in: ['GOAL', 'PENALTY_GOAL'] }, participantName: { not: null } },
    select: { id: true, teamId: true, participantName: true },
  });
  const squads = new Map();
  for (const e of events) {
    const name = e.participantName.replace(/\s+/g, ' ').trim();
    if (!name) continue;
    const key = `${e.teamId}|${name}`;
    if (!squads.has(key)) squads.set(key, { teamId: e.teamId, name, events: [] });
    squads.get(key).events.push(e.id);
  }
  const year = new Map(teams.map((t) => [t.id, t.season?.year]));
  const perSeason = {};
  for (const s of squads.values()) perSeason[year.get(s.teamId)] = (perSeason[year.get(s.teamId)] || 0) + 1;
  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} — ${teams.length} Beer Sheva seasons without players; ${squads.size} players from ${events.length} goals`);
  console.log('players per season:', Object.entries(perSeason).map(([y, n]) => `${y}:${n}`).join(' '));

  if (!APPLY) { console.log('\nDry run — re-run with --apply.'); await prisma.$disconnect(); return; }

  const batchId = `${SOURCE}-squads-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  for (const s of squads.values()) {
    const space = s.name.indexOf(' ');
    const data = {
      teamId: s.teamId, nameHe: s.name, nameEn: s.name,
      ...(space > 0 ? { firstNameHe: s.name.slice(0, space), lastNameHe: s.name.slice(space + 1) } : {}),
      additionalInfo: { sources: [SOURCE] },
    };
    await prisma.$transaction(async (tx) => {
      const pl = await tx.player.create({ data, select: { id: true } });
      await tx.gameEvent.updateMany({ where: { id: { in: s.events } }, data: { playerId: pl.id } });
      await tx.dataImportChange.createMany({
        data: [
          { source: SOURCE, batchId, table: 'players', recordId: pl.id, field: '*created*', newValue: data, basis: 'squad-from-scorers' },
          ...s.events.map((id) => ({ source: SOURCE, batchId, table: 'game_events', recordId: id, field: 'playerId', newValue: pl.id, basis: 'squad-from-scorers' })),
        ],
      });
    });
  }
  await prisma.mergeOperation.create({
    data: {
      source: SOURCE, mergeType: 'squads', status: 'executed', executedAt: new Date(),
      description: `הארכיון של אייל חטב — סגלים מהמבקיעים (batch ${batchId})`,
      changesJson: { batchId, players: squads.size, goals: events.length },
      recordsMatched: events.length, recordsUpdated: events.length, recordsCreated: squads.size,
    },
  });
  console.log(`\ncreated ${squads.size} players, linked ${events.length} goals — batch ${batchId}`);
  await prisma.$disconnect();
})().catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
