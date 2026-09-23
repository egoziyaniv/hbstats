#!/usr/bin/env node
/** Import API-Football transfers for every current-season team. */
'use strict';
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const EXECUTE = process.argv.includes('--execute');
const seasonYear = Number(process.argv.find((x) => /^--season=\d+$/.test(x))?.split('=')[1] || (new Date().getMonth() >= 6 ? new Date().getFullYear() : new Date().getFullYear() - 1));
const base = process.env.API_FOOTBALL_BASE_URL || 'https://v3.football.api-sports.io';
const key = process.env.API_FOOTBALL_KEY;
if (!key) throw new Error('API_FOOTBALL_KEY is missing');
const nameFor = (team, fallback) => team?.nameHe || team?.nameEn || fallback || null;
const inSeason = (date) => date && new Date(date).getFullYear() >= seasonYear;
async function api(path) { const res = await fetch(`${base}${path}`, { headers: { 'x-apisports-key': key } }); if (!res.ok) throw new Error(`API ${res.status} for ${path}`); const json = await res.json(); return json.response || []; }
(async () => {
 const season = await prisma.season.findFirst({ where: { year: seasonYear }, select: { id: true, name: true } }); if (!season) throw new Error(`season ${seasonYear} missing`);
 const teams = await prisma.team.findMany({ where: { seasonId: season.id, apiFootballId: { not: null } }, select: { id: true, apiFootballId: true, nameHe: true, nameEn: true } });
 const apiIds = [...new Set(teams.map(t => t.apiFootballId).filter(Boolean))];
 const teamByApi = new Map(teams.map(t => [t.apiFootballId, t]));
 const plan = [];
 for (const teamId of apiIds) { const rows = await api(`/transfers?team=${teamId}`); for (const row of rows) for (const tr of row.transfers || []) {
   if (!inSeason(tr.date)) continue;
   const source = teamByApi.get(tr.teams?.out?.id); if (!source) continue;
   const player = await prisma.player.findFirst({ where: { apiFootballId: row.player?.id, teamId: source.id }, select: { id: true } });
   plan.push({ apiFootballPlayerId: row.player?.id || null, playerNameEn: row.player?.name || null, playerNameHe: null, transferDate: new Date(tr.date), transferTypeEn: tr.type || null, transferTypeHe: tr.type || null, sourceTeamApiFootballId: tr.teams?.out?.id || null, sourceTeamNameEn: tr.teams?.out?.name || null, sourceTeamNameHe: nameFor(source, tr.teams?.out?.name), sourceTeamLogoUrl: tr.teams?.out?.logo || null, destinationTeamApiFootballId: tr.teams?.in?.id || null, destinationTeamNameEn: tr.teams?.in?.name || null, destinationTeamNameHe: nameFor(teamByApi.get(tr.teams?.in?.id), tr.teams?.in?.name), destinationTeamLogoUrl: tr.teams?.in?.logo || null, sourceUpdatedAt: row.update ? new Date(row.update) : null, seasonId: season.id, playerId: player?.id || null });
 }}
 console.log(`=== transfer sync ${season.name} ${EXECUTE ? 'EXECUTE' : 'DRY'} === teams=${apiIds.length} rows=${plan.length}`);
 for (const row of plan.slice(0, 20)) console.log(`${row.playerNameEn}: ${row.sourceTeamNameHe} → ${row.destinationTeamNameHe} (${row.transferTypeEn})`);
 if (EXECUTE) { await prisma.$transaction(async tx => { await tx.playerTransfer.deleteMany({ where: { seasonId: season.id } }); if (plan.length) await tx.playerTransfer.createMany({ data: plan }); }); console.log(`Saved ${plan.length} transfers.`); }
 else console.log('Dry run only. Pass --execute to write.');
})().catch(e => { console.error('FATAL:', e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
