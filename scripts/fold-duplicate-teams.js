#!/usr/bin/env node
'use strict';
/**
 * One club, one team per season. Old imports left a club held several times in the same
 * season under one Hebrew name:
 *   - "Maccabi Netanya" (API-Football id, holds the table row) next to "Maccabi Nethanya"
 *     (RSSSF, holds the games) and "Maccabi Nethanya(1)" (RSSSF cup tag);
 *   - "Hapoel Beer-Sheva [aet, 5-4 pen]" — a cup final's extra time and shootout parsed into
 *     the team name (the game itself already holds the shootout).
 *
 * Per season and Hebrew name, the team kept is the one with an API-Football id, else a table
 * row, else the most games, else a clean English name. The others are folded into it — games,
 * events and lineup entries move over — and removed. A duplicate anything else hangs on
 * (players, statistics, uploads...) is left alone and reported. A bracketed name with no
 * duplicate just loses the bracket.
 *
 * Ledger: data_import_changes, source 'team-fold'; undo with
 *   node scripts/eyal-archive/rollback.js --source team-fold --all --apply
 *
 * Usage: node scripts/fold-duplicate-teams.js [--apply]
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

const SOURCE = 'team-fold';
const APPLY = process.argv.includes('--apply');
const BRACKET = /\s*\[[^\]]*\]\s*$/;
const DIRTY = /\[|\(\s*(\d+|x|A|B|C|Artzit)\s*\)\s*$/;
// What a folded team may carry — moved to the kept team. Anything else blocks the fold.
const MOVABLE = new Set(['homeGames', 'awayGames', 'homeEvents', 'lineupEntries']);
const prisma = new PrismaClient();

const games = (t) => t._count.homeGames + t._count.awayGames;
const blockers = (t) => Object.entries(t._count).filter(([k, v]) => v > 0 && !MOVABLE.has(k)).map(([k, v]) => `${k}:${v}`);

function rank(t) {
  return [t.apiFootballId != null ? 1 : 0, t._count.standings > 0 ? 1 : 0, games(t), DIRTY.test(t.nameEn) ? 0 : 1];
}
const better = (a, b) => {
  const x = rank(a);
  const y = rank(b);
  for (let i = 0; i < x.length; i += 1) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
};

(async () => {
  const teams = await prisma.team.findMany({
    select: {
      id: true, nameEn: true, nameHe: true, seasonId: true, apiFootballId: true,
      season: { select: { year: true } },
      _count: {
        select: {
          homeGames: true, awayGames: true, homeEvents: true, lineupEntries: true, players: true, standings: true,
          leaderboardEntries: true, fetchJobs: true, uploads: true, injuries: true, coachAssignments: true,
          teamStats: true, sofascoreStats: true, clubSeasonDossiers: true,
        },
      },
    },
  });

  const groups = new Map();
  for (const t of teams) {
    if (!t.seasonId || !t.nameHe) continue;
    const k = `${t.seasonId}|${t.nameHe.trim()}`;
    groups.set(k, [...(groups.get(k) || []), t]);
  }
  const folds = [];
  const blocked = [];
  const renames = [];
  for (const list of groups.values()) {
    if (list.length > 1) {
      const keep = list.reduce((a, b) => (better(b, a) ? b : a));
      for (const t of list) {
        if (t === keep) continue;
        const b = blockers(t);
        if (b.length) blocked.push(`${t.season?.year} ${t.nameEn} / ${t.nameHe} → ${keep.nameEn}: ${b.join(', ')}`);
        else folds.push({ from: t, to: keep });
      }
      if (BRACKET.test(keep.nameEn)) renames.push({ team: keep, nameEn: keep.nameEn.replace(BRACKET, '').trim() });
    } else if (BRACKET.test(list[0].nameEn)) {
      renames.push({ team: list[0], nameEn: list[0].nameEn.replace(BRACKET, '').trim() });
    }
  }

  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} — ${teams.length} teams; fold ${folds.length}, blocked ${blocked.length}, rename ${renames.length}`);
  const sample = process.argv.includes('--all') ? folds : folds.slice(0, 25);
  for (const f of sample) console.log(`  ${f.from.season?.year} ${f.from.nameEn} (${games(f.from)} games) → ${f.to.nameEn} (${games(f.to)} games${f.to.apiFootballId ? ', api' : ''}${f.to._count.standings ? ', table' : ''})`);
  for (const b of blocked) console.log(`  BLOCKED ${b}`);
  for (const r of renames) console.log(`  rename ${r.team.season?.year} "${r.team.nameEn}" → "${r.nameEn}"`);

  if (!APPLY) { console.log('\nDry run — re-run with --apply.'); await prisma.$disconnect(); return; }

  const batchId = `${SOURCE}-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const ledger = (table, recordId, field, oldValue, newValue) => ({
    source: SOURCE, batchId, table, recordId, field, oldValue: oldValue ?? undefined, newValue: newValue ?? undefined, basis: 'duplicate-team',
  });
  let removed = 0;
  for (const { from, to } of folds) {
    const gs = await prisma.game.findMany({ where: { OR: [{ homeTeamId: from.id }, { awayTeamId: from.id }] }, select: { id: true, homeTeamId: true, awayTeamId: true } });
    const evs = await prisma.gameEvent.findMany({ where: { teamId: from.id }, select: { id: true } });
    const lus = await prisma.gameLineupEntry.findMany({ where: { teamId: from.id }, select: { id: true } });
    const gameUpdates = gs.flatMap((g) => [
      ...(g.homeTeamId === from.id ? [{ id: g.id, field: 'homeTeamId' }] : []),
      ...(g.awayTeamId === from.id ? [{ id: g.id, field: 'awayTeamId' }] : []),
    ]);
    const full = await prisma.team.findUnique({ where: { id: from.id } });
    await prisma.$transaction([
      ...gameUpdates.map((u) => prisma.game.update({ where: { id: u.id }, data: { [u.field]: to.id } })),
      ...evs.map((e) => prisma.gameEvent.update({ where: { id: e.id }, data: { teamId: to.id } })),
      ...lus.map((l) => prisma.gameLineupEntry.update({ where: { id: l.id }, data: { teamId: to.id } })),
      prisma.dataImportChange.createMany({
        data: [
          ...gameUpdates.map((u) => ledger('games', u.id, u.field, from.id, to.id)),
          ...evs.map((e) => ledger('game_events', e.id, 'teamId', from.id, to.id)),
          ...lus.map((l) => ledger('game_lineup_entries', l.id, 'teamId', from.id, to.id)),
          ledger('teams', from.id, '*deleted*', full, null),
        ],
      }),
      prisma.team.delete({ where: { id: from.id } }),
    ]);
    removed += 1;
  }
  for (const r of renames) {
    await prisma.$transaction([
      prisma.team.update({ where: { id: r.team.id }, data: { nameEn: r.nameEn } }),
      prisma.dataImportChange.create({ data: ledger('teams', r.team.id, 'nameEn', r.team.nameEn, r.nameEn) }),
    ]);
  }
  await prisma.mergeOperation.create({
    data: {
      source: SOURCE, mergeType: 'cleanup', status: 'executed', executedAt: new Date(),
      description: `Duplicate teams folded per season (batch ${batchId})`,
      changesJson: { batchId, folded: removed, renamed: renames.length, blocked },
      recordsMatched: folds.length, recordsUpdated: removed + renames.length, recordsCreated: 0,
    },
  });
  console.log(`\nfolded ${removed} teams, renamed ${renames.length} — batch ${batchId}`);
  await prisma.$disconnect();
})().catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
