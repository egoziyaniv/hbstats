#!/usr/bin/env node
/**
 * Reconciles reviewed 2026 Hapoel Beer Sheva roster records.
 * Default is dry-run. --execute only links duplicate identities and writes
 * reversible roster-status metadata; it never deletes players or match history.
 */
'use strict';
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const EXECUTE = process.argv.includes('--execute');

const SEASON_YEAR = 2026;
const TEAM_NAME = 'הפועל באר שבע';
const CANONICAL = {
  hamdi: 'cmoxgpt9n013dwfs25pb6v4fp',
  itay: 'cmoxgptti03z1wfs2s2jin6d8',
};
const IDS = {
  hamdiDuplicate: 'cmrouo05w007pi1ovr0p2q73a',
  itayAliases: ['cmrouo08t008ji1ovs1a5v1bi', 'cmru7t3q10003143lx1bwulcj'],
  itayApi: 'cms6lumjc00033c7bwnsb99a4',
  helder: 'cmrouo0al008xi1ov9y3dl37v',
  roy: 'cmrouo08c008fi1ov9y3dl37v',
};
function withStatus(info, rosterStatus) {
  return { ...(info && typeof info === 'object' ? info : {}), departed: true, rosterStatus };
}
async function assertCurrentTeam(ids) {
  const rows = await prisma.player.findMany({ where: { id: { in: ids } }, include: { team: { include: { season: true } } } });
  if (rows.length !== ids.length || rows.some((r) => r.team.nameHe !== TEAM_NAME || r.team.season.year !== SEASON_YEAR)) {
    throw new Error('Safety check failed: expected reviewed 2026 Hapoel Beer Sheva player rows were not found.');
  }
  return new Map(rows.map((r) => [r.id, r]));
}
async function main() {
  const ids = [IDS.hamdiDuplicate, ...IDS.itayAliases, IDS.itayApi, IDS.helder, IDS.roy];
  const rows = await assertCurrentTeam(ids);
  const plan = [
    { label: 'חמודי כנעאן', id: IDS.hamdiDuplicate, data: { nameHe: 'חמודי כנעאן', canonicalPlayerId: CANONICAL.hamdi }, note: 'קישור רשומת מקור כפולה למשפחת ה-API המאומתת' },
    ...IDS.itayAliases.map((id) => ({ label: 'איתי חזות', id, data: { nameHe: 'איתי חזות', canonicalPlayerId: CANONICAL.itay, additionalInfo: withStatus(rows.get(id).additionalInfo, { kind: 'LOAN', destinationNameHe: 'מ.ס. אשדוד', effectiveDate: '2026-09-20', sourceUrl: 'https://sports.walla.co.il/item/3869054' }) }, note: 'איחוד כתיב + השאלה למ.ס. אשדוד' })),
    { label: 'איתי חזות', id: IDS.itayApi, data: { nameHe: 'איתי חזות', additionalInfo: withStatus(rows.get(IDS.itayApi).additionalInfo, { kind: 'LOAN', destinationNameHe: 'מ.ס. אשדוד', effectiveDate: '2026-09-20', sourceUrl: 'https://sports.walla.co.il/item/3869054' }) }, note: 'השאלה למ.ס. אשדוד' },
    { label: 'הלדר לופס', id: IDS.helder, data: { additionalInfo: withStatus(rows.get(IDS.helder).additionalInfo, { kind: 'DEPARTED', effectiveDate: '2026-07-29', showInSquadArchive: false, sourceUrl: 'https://sports.walla.co.il/item/3857066' }) }, note: 'עזב את המועדון' },
    { label: 'רועי לוי', id: IDS.roy, data: { additionalInfo: withStatus(rows.get(IDS.roy).additionalInfo, { kind: 'LOAN', destinationNameHe: 'הפועל פתח תקווה', effectiveDate: '2026-09-16', sourceUrl: 'https://www.365scores.com/he/football/player/roy-levi-68649' }) }, note: 'מושאל להפועל פתח תקווה' },
  ];
  console.log(`=== Beer Sheva 2026 roster reconciliation (${EXECUTE ? 'EXECUTE' : 'DRY RUN'}) ===`);
  for (const item of plan) console.log(`${EXECUTE ? 'WRITE' : 'PLAN '} ${item.label}: ${item.note} [${item.id}]`);
  if (EXECUTE) await prisma.$transaction(plan.map((item) => prisma.player.update({ where: { id: item.id }, data: item.data })));
  console.log(EXECUTE ? 'Reconciliation applied. No player rows or history were deleted.' : 'Pass --execute to apply this reviewed, reversible plan.');
}
main().catch((error) => { console.error('FATAL:', error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
