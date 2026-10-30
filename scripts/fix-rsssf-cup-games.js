#!/usr/bin/env node
'use strict';
/**
 * The RSSSF history import (1992-97) wrote State Cup games into the league. They are the
 * league games with no round whose teams carry RSSSF's cup division tag — "Hapoel Tel Aviv(1)",
 * "Maccabi Acre (A)", "Hapoel Ashdod (Artzit)" — and each tag became a team of its own,
 * so every top-flight club of 1992-94 is held twice.
 *
 *  1. those games move to the State Cup (comp_state_cup);
 *  2. a tagged team that is a club already in that season's league is folded into it —
 *     its games and events point at the league team, and the empty tagged team is removed.
 *     Lower-division clubs that played only in the cup keep their own team.
 *
 * Every change goes to the data_import_changes ledger (source 'rsssf-cup-fix'), so
 *   node scripts/eyal-archive/rollback.js --source rsssf-cup-fix --all --apply
 * puts it all back.
 *
 * Usage: node scripts/fix-rsssf-cup-games.js [--apply]
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
const { teamNameScore } = require('./lib/eyal-archive');

const SOURCE = 'rsssf-cup-fix';
const LEAGUE = 'comp_liga_haal';
const CUP = 'comp_state_cup';
const TAG = /\s*\((\d+|x|A|B|C|Artzit)\)\s*$/;
const APPLY = process.argv.includes('--apply');
const prisma = new PrismaClient();

const untagged = (n) => String(n || '').replace(TAG, '').replace(/-/g, ' ').toLowerCase().trim();

/** The league team a tagged team stands for: same Hebrew name, else same English name
 *  without the tag, else the one Hebrew name that agrees ("בני יהודה תל אביב" / "בני יהודה"). */
function leagueTwin(team, seasonTeams) {
  const plain = seasonTeams.filter((t) => t.id !== team.id && !TAG.test(t.nameEn));
  for (const pick of [
    (t) => t.nameHe === team.nameHe,
    (t) => untagged(t.nameEn) === untagged(team.nameEn),
    (t) => teamNameScore(team.nameHe, t.nameHe) >= 2,
  ]) {
    const hits = plain.filter(pick);
    if (hits.length === 1) return hits[0];
    if (hits.length > 1) return null;
  }
  return null;
}

(async () => {
  const tagged = (await prisma.team.findMany({
    where: { nameEn: { contains: '(' } },
    select: { id: true, nameEn: true, nameHe: true, seasonId: true },
  })).filter((t) => TAG.test(t.nameEn));
  const taggedIds = new Set(tagged.map((t) => t.id));

  // 1. cup games sitting in the league
  const cupGames = await prisma.game.findMany({
    where: {
      competitionId: LEAGUE, roundNameEn: null, roundNameHe: null,
      OR: [{ homeTeamId: { in: [...taggedIds] } }, { awayTeamId: { in: [...taggedIds] } }],
    },
    select: { id: true },
  });

  // 2. tagged teams that are league clubs
  const seasonIds = [...new Set(tagged.map((t) => t.seasonId))];
  const bySeason = new Map();
  for (const t of await prisma.team.findMany({ where: { seasonId: { in: seasonIds } }, select: { id: true, nameEn: true, nameHe: true, seasonId: true } })) {
    bySeason.set(t.seasonId, [...(bySeason.get(t.seasonId) || []), t]);
  }
  const folds = [];
  const keep = [];
  for (const t of tagged) {
    const twin = leagueTwin(t, bySeason.get(t.seasonId) || []);
    if (twin) folds.push({ from: t, to: twin });
    else keep.push(t);
  }

  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} — tagged teams ${tagged.length}: fold into a league team ${folds.length}, keep (cup-only clubs) ${keep.length}`);
  console.log(`cup games to move ${LEAGUE} → ${CUP}: ${cupGames.length}`);
  for (const f of folds) if (f.from.nameHe !== f.to.nameHe || process.argv.includes("--all-folds")) console.log(`  ${f.from.nameEn} / ${f.from.nameHe} → ${f.to.nameEn} / ${f.to.nameHe}`);

  if (!APPLY) { console.log('\nDry run — re-run with --apply.'); await prisma.$disconnect(); return; }

  const batchId = `${SOURCE}-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const ledger = (table, recordId, field, oldValue, newValue) => ({
    source: SOURCE, batchId, table, recordId, field, oldValue: oldValue ?? undefined, newValue: newValue ?? undefined, basis: 'rsssf-cup-in-league',
  });

  for (const g of cupGames) {
    await prisma.$transaction([
      prisma.game.update({ where: { id: g.id }, data: { competitionId: CUP } }),
      prisma.dataImportChange.create({ data: ledger('games', g.id, 'competitionId', LEAGUE, CUP) }),
    ]);
  }

  let removed = 0;
  for (const { from, to } of folds) {
    const games = await prisma.game.findMany({ where: { OR: [{ homeTeamId: from.id }, { awayTeamId: from.id }] }, select: { id: true, homeTeamId: true } });
    const events = await prisma.gameEvent.findMany({ where: { teamId: from.id }, select: { id: true } });
    await prisma.$transaction([
      ...games.map((g) => {
        const field = g.homeTeamId === from.id ? 'homeTeamId' : 'awayTeamId';
        return prisma.game.update({ where: { id: g.id }, data: { [field]: to.id } });
      }),
      ...events.map((e) => prisma.gameEvent.update({ where: { id: e.id }, data: { teamId: to.id } })),
      prisma.dataImportChange.createMany({
        data: [
          ...games.map((g) => ledger('games', g.id, g.homeTeamId === from.id ? 'homeTeamId' : 'awayTeamId', from.id, to.id)),
          ...events.map((e) => ledger('game_events', e.id, 'teamId', from.id, to.id)),
        ],
      }),
    ]);
    // The tagged team is empty now; anything else still pointing at it keeps it.
    const full = await prisma.team.findUnique({ where: { id: from.id } });
    try {
      await prisma.$transaction([
        prisma.team.delete({ where: { id: from.id } }),
        prisma.dataImportChange.create({ data: ledger('teams', from.id, '*deleted*', full, null) }),
      ]);
      removed += 1;
    } catch (e) {
      console.log(`  kept ${from.nameEn}: ${e.code || e.message}`);
    }
  }

  await prisma.mergeOperation.create({
    data: {
      source: SOURCE, mergeType: 'cleanup', status: 'executed', executedAt: new Date(),
      description: `RSSSF State Cup games out of the league (batch ${batchId})`,
      changesJson: { batchId, cupGames: cupGames.length, folded: folds.length, removed },
      recordsMatched: tagged.length, recordsUpdated: cupGames.length + folds.length, recordsCreated: 0,
    },
  });
  console.log(`\nmoved ${cupGames.length} games to the State Cup, folded ${folds.length} teams (${removed} removed) — batch ${batchId}`);
  await prisma.$disconnect();
})().catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
