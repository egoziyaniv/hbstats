#!/usr/bin/env node
/**
 * 60-historical.js — RSSSF historical migration (1948-2008).
 *
 * Reads:  scraped_standings, scraped_matches, scraped_leaderboards (source='rsssf')
 * Writes: seasons, teams (per-season with Hebrew names), standings, games
 *
 * Team-name mapping: RSSSF English → canonical Hebrew. 50 distinct teams.
 * Cross-season queries (e.g. "wins since 1990") use team.nameHe as the join key.
 *
 * Usage:
 *   node scripts/rebuild/60-historical.js              # dry-run
 *   node scripts/rebuild/60-historical.js --apply
 */

'use strict';
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

const { RSSSF_TO_HE, parseSeasonStartYear } = require('../lib/rsssf-teams');

async function main() {
  console.log(`${APPLY ? '✓ Applying' : '[DRY RUN]'} RSSSF historical migration`);

  const seasons = await prisma.season.findMany({ select: { id: true, year: true } });
  const seasonByYear = new Map(seasons.map((s) => [s.year, s.id]));

  // Build a per-season-year team cache: { year: Map(nameHe → teamId) }
  const teamCache = new Map();
  async function getOrCreateTeam(year, nameHe, nameEn) {
    if (!teamCache.has(year)) teamCache.set(year, new Map());
    const cache = teamCache.get(year);
    if (cache.has(nameHe)) return cache.get(nameHe);

    const seasonId = seasonByYear.get(year);
    if (!seasonId) return null;

    let team = await prisma.team.findFirst({ where: { seasonId, nameHe } });
    if (!team && APPLY) {
      try {
        team = await prisma.team.create({ data: { seasonId, nameHe, nameEn } });
      } catch (e) {
        // probably nameEn collision — fallback to find by nameEn
        team = await prisma.team.findFirst({ where: { seasonId, nameEn } });
      }
    }
    if (team) cache.set(nameHe, team.id);
    return team?.id || null;
  }

  // ── Standings ──
  const rsssfStandings = await prisma.scrapedStanding.findMany({
    where: { source: 'rsssf' },
    orderBy: [{ season: 'asc' }, { position: 'asc' }],
  });
  console.log(`\n  RSSSF standings to migrate: ${rsssfStandings.length}`);

  let stCreated = 0, stSkipped = 0;
  for (const r of rsssfStandings) {
    const year = parseSeasonStartYear(r.season);
    if (!year) { stSkipped++; continue; }

    const nameEn = r.teamNameHe; // RSSSF column is misnamed — content is English
    const nameHe = RSSSF_TO_HE[nameEn] || nameEn;

    const teamId = await getOrCreateTeam(year, nameHe, nameEn);
    if (!teamId) { stSkipped++; continue; }

    if (!APPLY) { stCreated++; continue; }

    try {
      await prisma.standing.upsert({
        where: { seasonId_teamId_competitionId: { seasonId: seasonByYear.get(year), teamId, competitionId: 'comp_liga_haal' } },
        update: {
          position: r.position, points: r.points, played: r.played,
          wins: r.wins, draws: r.draws, losses: r.losses,
          goalsFor: r.goalsFor, goalsAgainst: r.goalsAgainst,
          goalsDiff: r.goalDifference,
          competitionId: 'comp_liga_haal',
        },
        create: {
          seasonId: seasonByYear.get(year), teamId, competitionId: 'comp_liga_haal',
          position: r.position, points: r.points, played: r.played,
          wins: r.wins, draws: r.draws, losses: r.losses,
          goalsFor: r.goalsFor, goalsAgainst: r.goalsAgainst,
          goalsDiff: r.goalDifference,
        },
      });
      stCreated++;
    } catch (e) { stSkipped++; }
  }
  console.log(`  ${APPLY ? '✓ created/updated' : 'would create'}: ${stCreated}, skipped: ${stSkipped}`);

  // ── Matches ──
  const rsssfMatches = await prisma.scrapedMatch.findMany({
    where: { source: 'rsssf' },
    select: { dateTime: true, season: true, round: true, homeTeamName: true, awayTeamName: true,
              homeScore: true, awayScore: true },
  });
  console.log(`\n  RSSSF matches to migrate: ${rsssfMatches.length}`);

  let gCreated = 0, gSkipped = 0;
  for (const m of rsssfMatches) {
    const year = parseSeasonStartYear(m.season);
    if (!year) { gSkipped++; continue; }
    const seasonId = seasonByYear.get(year);
    if (!seasonId) { gSkipped++; continue; }

    const homeNameHe = RSSSF_TO_HE[m.homeTeamName] || m.homeTeamName;
    const awayNameHe = RSSSF_TO_HE[m.awayTeamName] || m.awayTeamName;
    const homeTeamId = await getOrCreateTeam(year, homeNameHe, m.homeTeamName);
    const awayTeamId = await getOrCreateTeam(year, awayNameHe, m.awayTeamName);
    if (!homeTeamId || !awayTeamId) { gSkipped++; continue; }

    // No date in RSSSF: 1 September of the season start — src/lib/game-date.ts shows
    // these as season + round instead of a date.
    const dt = m.dateTime || new Date(`${year}-09-01`);

    if (!APPLY) { gCreated++; continue; }

    try {
      await prisma.game.create({
        data: {
          seasonId, competitionId: 'comp_liga_haal',
          homeTeamId, awayTeamId, dateTime: dt,
          homeScore: m.homeScore, awayScore: m.awayScore,
          roundNameEn: m.round || null,
          status: 'COMPLETED',
        },
      });
      gCreated++;
    } catch (e) { gSkipped++; }
  }
  console.log(`  ${APPLY ? '✓ created' : 'would create'}: ${gCreated}, skipped: ${gSkipped}`);

  console.log(`\n${APPLY ? '✓ Applied' : '[DRY RUN]'} RSSSF migration done.`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
