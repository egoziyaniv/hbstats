/**
 * fetch-player-trophies.js — pull /trophies?player=X for every distinct
 * API-Football player id in our DB into PlayerTrophy.
 *
 * One call per player (~3,310 calls). Stores league/country/season/place.
 */
'use strict';
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const env = fs.readFileSync(__dirname + '/../.env', 'utf8');
const API_KEY = (env.match(/API_FOOTBALL_KEY=(.+)/) || [])[1]?.trim();
const API_BASE = (env.match(/API_FOOTBALL_BASE_URL=(.+)/) || [])[1]?.trim() || 'https://v3.football.api-sports.io';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path, retries = 3) {
  for (let a = 0; a <= retries; a++) {
    try {
      const res = await fetch(`${API_BASE}${path}`, { headers: { 'x-apisports-key': API_KEY } });
      const d = await res.json();
      if (d.errors && Object.keys(d.errors).length && a < retries) { await sleep(1500 * (a + 1)); continue; }
      return d.response || [];
    } catch (e) { if (a < retries) { await sleep(1500 * (a + 1)); continue; } throw e; }
  }
  return [];
}

async function main() {
  if (!API_KEY) { console.error('No API key'); process.exit(1); }
  const ids = await prisma.$queryRaw`SELECT DISTINCT "apiFootballId" FROM "players" WHERE "apiFootballId" IS NOT NULL`;
  const list = ids.map((r) => r.apiFootballId);
  console.log(`Players to fetch trophies for: ${list.length}`);

  // Find a default season to attach trophies to (any will do — trophies are career, season is just an index)
  const anySeason = await prisma.season.findFirst({ orderBy: { year: 'desc' } });
  const defaultSeasonId = anySeason.id;
  const seasonsByLabel = new Map();
  const allSeasons = await prisma.season.findMany({ select: { id: true, name: true } });
  for (const s of allSeasons) seasonsByLabel.set(s.name, s.id);

  let processed = 0, inserted = 0, apiCalls = 0, errors = 0;
  for (const apiId of list) {
    try {
      const trophies = await api(`/trophies?player=${apiId}`);
      apiCalls++;
      const player = await prisma.player.findFirst({ where: { apiFootballId: apiId }, select: { id: true, nameEn: true, nameHe: true } });
      for (const t of trophies) {
        const seasonLabel = t.season || null;
        const seasonId = (seasonLabel && seasonsByLabel.get(seasonLabel)) || defaultSeasonId;
        try {
          await prisma.playerTrophy.create({
            data: {
              apiFootballPlayerId: apiId,
              playerNameEn: player?.nameEn || null,
              playerNameHe: player?.nameHe || null,
              leagueNameEn: t.league || 'Unknown',
              countryEn: t.country || null,
              seasonLabel,
              placeEn: t.place || null,
              seasonId,
              playerId: player?.id || null,
            },
          });
          inserted++;
        } catch {}
      }
      processed++;
      if (processed % 200 === 0) console.log(`  ${processed}/${list.length}, ${inserted} trophies inserted, ${apiCalls} calls`);
      await sleep(280);
    } catch (e) { errors++; console.log('  ! id', apiId, e.message.slice(0, 60)); }
  }
  console.log(`\nDone. processed=${processed}, inserted=${inserted}, apiCalls=${apiCalls}, errors=${errors}`);
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
