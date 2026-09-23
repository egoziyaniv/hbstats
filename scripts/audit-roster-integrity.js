#!/usr/bin/env node
/** Read-only current-season roster/transfer audit. Never writes. */
'use strict';
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const arg = (name) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : null; };
const year = Number(arg('season') || (new Date().getMonth() >= 6 ? new Date().getFullYear() : new Date().getFullYear() - 1));
const teamId = arg('team');
const output = arg('json');
function statusKind(type) { const t = (type || '').toLowerCase(); return t.includes('loan') ? 'LOAN' : t.includes('transfer') || t.includes('sold') ? 'SOLD' : 'DEPARTED'; }
(async () => {
  const season = await prisma.season.findFirst({ where: { year }, select: { id: true, name: true } });
  if (!season) throw new Error(`Season ${year} not found`);
  const players = await prisma.player.findMany({ where: { team: { seasonId: season.id, ...(teamId ? { id: teamId } : {}) } }, select: { id: true, nameHe: true, nameEn: true, apiFootballId: true, canonicalPlayerId: true, birthDate: true, team: { select: { id: true, nameHe: true, apiFootballId: true } } } });
  const transfers = await prisma.playerTransfer.findMany({ where: { seasonId: season.id }, orderBy: { transferDate: 'desc' } });
  const verified = [];
  for (const transfer of transfers) for (const player of players) {
    if (transfer.apiFootballPlayerId && transfer.apiFootballPlayerId === player.apiFootballId && transfer.sourceTeamApiFootballId === player.team.apiFootballId) verified.push({ playerId: player.id, playerNameHe: player.nameHe, teamNameHe: player.team.nameHe, kind: statusKind(transfer.transferTypeEn), destinationNameHe: transfer.destinationTeamNameHe, effectiveDate: transfer.transferDate?.toISOString().slice(0, 10), transferId: transfer.id });
  }
  const report = { season: season.name, generatedAt: new Date().toISOString(), counts: { players: players.length, transfers: transfers.length, verified: verified.length }, verified, review: [] };
  const json = JSON.stringify(report, null, 2);
  if (output) require('fs').writeFileSync(output, json);
  console.log(json);
})().catch((error) => { console.error('FATAL:', error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
