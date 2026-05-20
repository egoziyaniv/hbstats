#!/usr/bin/env node
/**
 * Backfill PlayerStatistics from Flashscore career[].
 *
 * Many historical PlayerStatistics rows exist with all-zero values (created
 * by older scrapers as placeholders). Meanwhile Flashscore returns per-player
 * per-season per-competition career data (apps, goals, assists, yellow, red,
 * rating). This script reads that career data from `Player.additionalInfo.
 * flashscore.career` and either:
 *   - UPDATES a PlayerStatistics row when one exists with zero gamesPlayed
 *     (we don't trample richer API-Football data when present)
 *   - CREATES a new PlayerStatistics row when none exists.
 *
 * The Flashscore career array sits on the canonical Player record (set by
 * scripts/rebuild/44-flashscore-enrichment.js). We write PlayerStatistics
 * under that same canonical id so cross-season queries work.
 *
 * Usage:
 *   node scripts/rebuild/46-career-to-player-statistics.js          # dry-run
 *   node scripts/rebuild/46-career-to-player-statistics.js --apply  # write
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const APPLY = process.argv.includes('--apply');

// Map the Flashscore competition string to our internal Competition.id.
// Names are normalized (lowercase, no apostrophes) before lookup so small
// variations like "Ligat ha'Al" vs "Ligat HaAl" still match.
const COMPETITION_MAP = new Map(
  Object.entries({
    'ligat haal': 'comp_liga_haal',
    'ligat ha al': 'comp_liga_haal',
    'leumit league': 'comp_liga_leumit',
    'liga leumit': 'comp_liga_leumit',
    'state cup': 'comp_state_cup',
    'super cup': 'comp_super_cup',
    'toto cup ligat al': 'comp_toto_cup_al',
    'toto cup leumit': 'comp_toto_cup_leumit',
    'toto cup': 'comp_toto_cup_al', // ambiguous default
  }),
);
function normalizeCompName(s) {
  return (s || '')
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function competitionIdFor(rawName) {
  const key = normalizeCompName(rawName);
  return COMPETITION_MAP.get(key) ?? null;
}

// Parse Flashscore season string "2024/2025" → year 2024.
function startYearFromSeasonLabel(label) {
  if (!label || typeof label !== 'string') return null;
  const m = label.match(/(\d{4})/);
  return m ? parseInt(m[1], 10) : null;
}

async function main() {
  console.log(APPLY ? '=== APPLY mode (writing) ===' : '=== DRY-RUN mode (no writes) ===');

  // Build season-id-by-year map once.
  const seasons = await prisma.season.findMany({ select: { id: true, year: true } });
  const seasonByYear = new Map(seasons.map((s) => [s.year, s.id]));

  // Step 1: enrichment (script 44) writes Flashscore data onto the matched
  // per-season Player record, not the canonical one. Propagate that data to
  // the canonical so reads (player page, mobile, etc.) find it where they
  // look. We pick the most-recent record that has data for each canonical
  // key — multiple per-season records can have data if enrichment ran more
  // than once, the latest wins.
  const playersWithData = await prisma.player.findMany({
    where: {
      additionalInfo: { path: ['flashscore', 'career'], not: { equals: null } },
    },
    select: {
      id: true,
      canonicalPlayerId: true,
      nameHe: true,
      nameEn: true,
      additionalInfo: true,
      team: { select: { season: { select: { year: true } } } },
    },
  });
  const byCanonical = new Map();
  for (const row of playersWithData) {
    const canonId = row.canonicalPlayerId ?? row.id;
    const existing = byCanonical.get(canonId);
    const newer = (row.team?.season?.year ?? 0) > (existing?.team?.season?.year ?? 0);
    if (!existing || newer) byCanonical.set(canonId, row);
  }
  console.log(`Propagating Flashscore data to ${byCanonical.size} canonical records...`);
  let propagated = 0;
  for (const [canonId, src] of byCanonical) {
    if (canonId === src.id) continue; // already canonical, nothing to copy
    if (APPLY) {
      const canonical = await prisma.player.findUnique({
        where: { id: canonId },
        select: { id: true, additionalInfo: true },
      });
      if (canonical) {
        const merged = {
          ...(canonical.additionalInfo || {}),
          flashscore: src.additionalInfo.flashscore,
        };
        await prisma.player.update({ where: { id: canonId }, data: { additionalInfo: merged } });
      }
    }
    propagated++;
  }
  console.log(`  propagated ${propagated} canonical records`);

  // Step 2: Re-load all canonical Players that now have Flashscore career.
  const players = await prisma.player.findMany({
    where: {
      canonicalPlayerId: null,
      additionalInfo: { path: ['flashscore', 'career'], not: { equals: null } },
    },
    select: { id: true, nameHe: true, nameEn: true, additionalInfo: true },
  });
  console.log(`Found ${players.length} canonical players with Flashscore career data`);

  let createdCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  let unmappedCompetition = 0;
  let unmappedSeason = 0;

  for (const player of players) {
    const career = player.additionalInfo?.flashscore?.career;
    if (!Array.isArray(career)) continue;

    for (const row of career) {
      const startYear = startYearFromSeasonLabel(row.season);
      const seasonId = startYear !== null ? seasonByYear.get(startYear) : null;
      if (!seasonId) {
        unmappedSeason++;
        continue;
      }
      const competitionId = competitionIdFor(row.competition);
      if (!competitionId) {
        unmappedCompetition++;
        continue;
      }

      const data = {
        gamesPlayed: typeof row.apps === 'number' ? row.apps : 0,
        goals: typeof row.goals === 'number' ? row.goals : 0,
        assists: typeof row.assists === 'number' ? row.assists : 0,
        yellowCards: typeof row.yellow === 'number' ? row.yellow : 0,
        redCards: typeof row.red === 'number' ? row.red : 0,
        rating: typeof row.rating === 'number' ? row.rating : null,
      };

      // Skip rows that are entirely empty — nothing to backfill.
      if (data.gamesPlayed === 0 && data.goals === 0 && data.assists === 0 && data.yellowCards === 0 && data.redCards === 0) {
        continue;
      }

      const existing = await prisma.playerStatistics.findUnique({
        where: {
          playerId_seasonId_competitionId: {
            playerId: player.id,
            seasonId,
            competitionId,
          },
        },
      });

      if (!existing) {
        if (APPLY) {
          await prisma.playerStatistics.create({
            data: {
              playerId: player.id,
              seasonId,
              competitionId,
              gamesPlayed: data.gamesPlayed,
              goals: data.goals,
              assists: data.assists,
              yellowCards: data.yellowCards,
              redCards: data.redCards,
              rating: data.rating,
            },
          });
        }
        createdCount++;
        continue;
      }

      // Only fill empty slots. If existing row already has non-zero
      // gamesPlayed (likely from API-Football) we leave it alone — that
      // source is generally richer.
      if ((existing.gamesPlayed ?? 0) > 0) {
        skippedCount++;
        continue;
      }

      if (APPLY) {
        await prisma.playerStatistics.update({
          where: { id: existing.id },
          data,
        });
      }
      updatedCount++;
    }
  }

  console.log('--- Summary ---');
  console.log(`Created: ${createdCount}`);
  console.log(`Updated (was zero, now filled): ${updatedCount}`);
  console.log(`Skipped (existing non-zero): ${skippedCount}`);
  console.log(`Unmapped season: ${unmappedSeason}`);
  console.log(`Unmapped competition: ${unmappedCompetition}`);
  if (!APPLY) console.log('Re-run with --apply to write changes.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
}).finally(() => prisma.$disconnect());
