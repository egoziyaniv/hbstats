#!/usr/bin/env node
/** Current-season roster/transfer audit; --apply-verified writes only latest verified exits. */
'use strict';
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const arg = (name) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : null; };
const year = Number(arg('season') || (new Date().getMonth() >= 6 ? new Date().getFullYear() : new Date().getFullYear() - 1));
const teamId = arg('team'); const output = arg('json'); const APPLY = process.argv.includes('--apply-verified');
function kind(type) { const t = (type || '').toLowerCase(); return t.includes('loan') && !t.includes('return') ? 'LOAN' : t.includes('transfer') || t.includes('sold') ? 'SOLD' : 'DEPARTED'; }
function normalizedName(value) { return String(value || '').trim().toLocaleLowerCase().replace(/[\-–—'"׳״.,]/g, '').replace(/\s+/g, ' '); }
function destinationForStatus(transfer) { return (transfer.transferTypeEn || '').toLowerCase().includes('free agent') ? null : transfer.destinationTeamNameHe || null; }
(async () => {
  const season = await prisma.season.findFirst({ where: { year }, select: { id: true, name: true } }); if (!season) throw new Error(`Season ${year} not found`);
  const players = await prisma.player.findMany({ where: { team: { seasonId: season.id, ...(teamId ? { id: teamId } : {}) } }, select: { id:true,nameHe:true,nameEn:true,apiFootballId:true,additionalInfo:true,team:{select:{id:true,nameHe:true,apiFootballId:true}} } });
  const transfers = await prisma.playerTransfer.findMany({ where: { seasonId: season.id }, orderBy: { transferDate: 'desc' } });
  const playersByApiId = new Map(players.filter(p => p.apiFootballId).map(p => [p.apiFootballId, p]));
  const candidates = []; const skipped = { missingIdentity: 0, sourceTeamMismatch: 0, sameApiTeam: 0, sameNamedTeam: 0 };
  for (const tr of transfers) {
    const p = tr.apiFootballPlayerId ? playersByApiId.get(tr.apiFootballPlayerId) : null;
    if (!p) { skipped.missingIdentity++; continue; }
    if (tr.sourceTeamApiFootballId !== p.team.apiFootballId) { skipped.sourceTeamMismatch++; continue; }
    if (tr.destinationTeamApiFootballId === tr.sourceTeamApiFootballId) { skipped.sameApiTeam++; continue; }
    if (normalizedName(tr.destinationTeamNameHe) && normalizedName(tr.destinationTeamNameHe) === normalizedName(p.team.nameHe)) { skipped.sameNamedTeam++; continue; }
    candidates.push({ player:p, tr, kind:kind(tr.transferTypeEn) });
  }
  const latest = new Map();
  for (const c of candidates) if (!latest.has(c.player.id)) latest.set(c.player.id, c);
  const verified = [...latest.values()].map(({player,tr,kind}) => ({ playerId:player.id, playerNameHe:player.nameHe, teamNameHe:player.team.nameHe, kind, destinationNameHe:destinationForStatus(tr), effectiveDate:tr.transferDate?.toISOString().slice(0,10), transferId:tr.id }));
  if (APPLY) await prisma.$transaction(verified.map(action => { const player = players.find(p => p.id === action.playerId); const info = player.additionalInfo && typeof player.additionalInfo === 'object' ? player.additionalInfo : {}; return prisma.player.update({ where:{id:action.playerId}, data:{additionalInfo:{...info,departed:true,rosterStatus:{kind:action.kind,destinationNameHe:action.destinationNameHe,effectiveDate:action.effectiveDate,confidence:'VERIFIED',updatedAt:new Date().toISOString()}}} }); }));
  const report = { season:season.name, generatedAt:new Date().toISOString(), counts:{players:players.length,transfers:transfers.length,candidates:candidates.length,verified:verified.length,applied:APPLY ? verified.length : 0}, skipped, verified, review:[] };
  const json = JSON.stringify(report,null,2); if(output) require('fs').writeFileSync(output,json); console.log(json);
})().catch(error=>{console.error('FATAL:',error.message);process.exitCode=1}).finally(()=>prisma.$disconnect());
