#!/usr/bin/env node

'use strict';

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const EXECUTE = process.argv.includes('--execute');
const CANONICAL_API_ID = 867;
const LEGACY_VENUE_IDS = [
  'cmoycq3a00003apuryts2re7e',
  'cmoycq3bz000oapur26pffweg',
  'cmq5he64z01hm5j5xvpa75p9j',
];
const TURNER_RAW_NAMES = [
  'Yaakov Turner Toto Stadium',
  'Yaakov Turner Toto Stadium (Be’ér Shéva (Beer Sheva) )',
  'Toto Turner Stadium',
  'באר שבע אצטדיון טוטו ע"ש טרנר',
  'אצטדיון טוטו טרנר',
];

function unlinkedTurnerWhere() {
  return {
    venueId: null,
    OR: [
      { venueNameEn: { in: TURNER_RAW_NAMES } },
      { venueNameHe: { in: TURNER_RAW_NAMES } },
    ],
  };
}

async function snapshot() {
  const canonical = await prisma.venue.findUnique({ where: { apiFootballId: CANONICAL_API_ID } });
  if (!canonical) throw new Error(`Canonical venue with apiFootballId ${CANONICAL_API_ID} was not found`);

  const aliases = await prisma.venue.findMany({ where: { id: { in: LEGACY_VENUE_IDS } }, orderBy: { id: 'asc' } });
  const [aliasGames, aliasTeams, aliasAssets, unlinkedGames, canonicalGames] = await Promise.all([
    prisma.game.count({ where: { venueId: { in: LEGACY_VENUE_IDS } } }),
    prisma.team.count({ where: { venueId: { in: LEGACY_VENUE_IDS } } }),
    prisma.mediaAsset.count({ where: { venueId: { in: LEGACY_VENUE_IDS } } }),
    prisma.game.count({ where: unlinkedTurnerWhere() }),
    prisma.game.count({ where: { venueId: canonical.id } }),
  ]);

  return { canonical, aliases, aliasGames, aliasTeams, aliasAssets, unlinkedGames, canonicalGames };
}

async function main() {
  const before = await snapshot();
  console.log(JSON.stringify({ mode: EXECUTE ? 'execute' : 'dry-run', before }, null, 2));
  if (!EXECUTE) return;

  const result = await prisma.$transaction(async (tx) => {
    const games = await tx.game.updateMany({
      where: { venueId: { in: LEGACY_VENUE_IDS } },
      data: {
        venueId: before.canonical.id,
        venueNameEn: 'Yaakov Turner Toto Stadium',
        venueNameHe: 'אצטדיון טוטו טרנר',
      },
    });
    const rawGames = await tx.game.updateMany({
      where: unlinkedTurnerWhere(),
      data: {
        venueId: before.canonical.id,
        venueNameEn: 'Yaakov Turner Toto Stadium',
        venueNameHe: 'אצטדיון טוטו טרנר',
      },
    });
    const teams = await tx.team.updateMany({
      where: { venueId: { in: LEGACY_VENUE_IDS } },
      data: {
        venueId: before.canonical.id,
        stadiumEn: 'Yaakov Turner Toto Stadium',
        stadiumHe: 'אצטדיון טוטו טרנר',
      },
    });
    const assets = await tx.mediaAsset.updateMany({
      where: { venueId: { in: LEGACY_VENUE_IDS } },
      data: { venueId: before.canonical.id },
    });
    await tx.venue.update({
      where: { id: before.canonical.id },
      data: {
        nameEn: 'Yaakov Turner Toto Stadium',
        nameHe: 'אצטדיון טוטו טרנר',
        cityEn: 'Beer Sheva',
        cityHe: 'באר שבע',
        countryEn: before.canonical.countryEn || 'Israel',
        countryHe: before.canonical.countryHe || 'ישראל',
      },
    });
    const deleted = await tx.venue.deleteMany({ where: { id: { in: LEGACY_VENUE_IDS } } });
    return { games: games.count, rawGames: rawGames.count, teams: teams.count, assets: assets.count, deleted: deleted.count };
  });

  const after = await snapshot();
  if (after.aliases.length || after.aliasGames || after.aliasTeams || after.aliasAssets || after.unlinkedGames) {
    throw new Error(`Turner merge validation failed: ${JSON.stringify(after)}`);
  }
  console.log(JSON.stringify({ result, after }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
