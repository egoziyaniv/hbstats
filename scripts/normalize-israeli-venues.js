#!/usr/bin/env node

'use strict';

const { PrismaClient } = require('@prisma/client');
const catalog = require('../src/data/israeli-venue-catalog.json');
const translations = require('../src/data/israeli-venue-translations.json');

const prisma = new PrismaClient();
const EXECUTE = process.argv.includes('--execute');
const REPLACE_IMAGES = process.argv.includes('--replace-images');

const canonicalById = new Map(catalog.canonicalVenues.map((entry) => [entry.id, entry]));

function numberSuffix(value) {
  const matches = value.match(/\b\d+\b/g);
  return matches?.length ? ` ${matches.join(' ')}` : '';
}

function translateVenue(venue) {
  const canonical = canonicalById.get(venue.id);
  if (canonical) return { nameHe: canonical.nameHe, cityHe: canonical.cityHe };

  const cityHe = venue.cityEn ? translations.cityTranslations[venue.cityEn] || null : null;
  const override = translations.venueOverrides[venue.nameEn];
  if (override) return { nameHe: override, cityHe };
  if (!cityHe) return null;

  const suffix = numberSuffix(venue.nameEn);
  let prefix = 'אצטדיון';
  if (/training/i.test(venue.nameEn)) prefix = 'מגרש האימונים';
  else if (/artificial|synthetic|senti/i.test(venue.nameEn)) prefix = 'המגרש הסינתטי';
  else if (/football school/i.test(venue.nameEn)) prefix = 'מגרש בית הספר לכדורגל';
  else if (/field|ground|lot/i.test(venue.nameEn)) prefix = 'מגרש';
  else if (/municipal/i.test(venue.nameEn)) prefix = 'האצטדיון העירוני';
  return { nameHe: `${prefix} ${cityHe}${suffix}`, cityHe };
}

async function israeliVenueIds(client) {
  return (await client.venue.findMany({
    where: {
      OR: [
        { countryEn: { equals: 'Israel', mode: 'insensitive' } },
        { countryHe: 'ישראל' },
        { teams: { some: { OR: [{ countryEn: { equals: 'Israel', mode: 'insensitive' } }, { countryHe: 'ישראל' }] } } },
        { games: { some: { competition: { OR: [{ countryEn: 'Israel' }, { countryHe: 'ישראל' }] } } } },
      ],
    },
    select: { id: true },
  })).map((row) => row.id);
}

const METADATA_FIELDS = ['addressEn', 'addressHe', 'capacity', 'surface', 'imageUrl'];

function isPresent(value) {
  return value !== null && value !== undefined && value !== '';
}

function mergeVenueMetadata(canonical, aliases) {
  const data = {};
  for (const field of METADATA_FIELDS) {
    if (isPresent(canonical[field])) continue;
    const source = aliases.find((alias) => isPresent(alias[field]));
    if (source) data[field] = source[field];
  }
  const aliasInfo = aliases.reduce((merged, alias) => {
    const info = alias.additionalInfo;
    return info && typeof info === 'object' && !Array.isArray(info) ? { ...merged, ...info } : merged;
  }, {});
  const canonicalInfo = canonical.additionalInfo && typeof canonical.additionalInfo === 'object' && !Array.isArray(canonical.additionalInfo)
    ? canonical.additionalInfo
    : {};
  const conflicts = metadataConflictDetails(canonical, aliases);
  const priorNormalization = canonicalInfo.venueNormalization && typeof canonicalInfo.venueNormalization === 'object' && !Array.isArray(canonicalInfo.venueNormalization)
    ? canonicalInfo.venueNormalization
    : {};
  const additionalInfo = {
    ...aliasInfo,
    ...canonicalInfo,
    venueNormalization: {
      ...priorNormalization,
      mergedAliasIds: aliases.map((alias) => alias.id),
      ...(Object.keys(conflicts).length ? { aliasMetadataConflicts: conflicts } : {}),
    },
  };
  if (Object.keys(additionalInfo).length) data.additionalInfo = additionalInfo;
  return data;
}

function metadataConflicts(canonical, aliases) {
  return Object.keys(metadataConflictDetails(canonical, aliases));
}

function metadataConflictDetails(canonical, aliases) {
  const conflicts = {};
  for (const field of METADATA_FIELDS) {
    const values = [canonical, ...aliases]
      .filter((venue) => isPresent(venue[field]))
      .map((venue) => ({ venueId: venue.id, value: venue[field] }));
    const unique = new Set(values.map(({ value }) => JSON.stringify(value)));
    if (unique.size > 1) conflicts[field] = values;
  }
  return conflicts;
}

async function plan(client) {
  const ids = await israeliVenueIds(client);
  const [venues, allVenues] = await Promise.all([
    client.venue.findMany({ where: { id: { in: ids } } }),
    client.venue.findMany(),
  ]);
  const existingIds = new Set(allVenues.map((venue) => venue.id));
  const venueById = new Map(allVenues.map((venue) => [venue.id, venue]));
  const merges = [];

  for (const entry of catalog.canonicalVenues) {
    if (!existingIds.has(entry.id)) continue;
    const aliasIds = entry.aliasIds.filter((id) => existingIds.has(id));
    if (!aliasIds.length) continue;
    const [games, teams, uploads] = await Promise.all([
      client.game.count({ where: { venueId: { in: aliasIds } } }),
      client.team.count({ where: { venueId: { in: aliasIds } } }),
      client.mediaAsset.count({ where: { venueId: { in: aliasIds } } }),
    ]);
    const aliases = aliasIds.map((id) => venueById.get(id)).filter(Boolean);
    merges.push({
      canonicalId: entry.id,
      nameHe: entry.nameHe,
      aliasIds,
      games,
      teams,
      uploads,
      metadataConflicts: metadataConflicts(venueById.get(entry.id), aliases),
    });
  }

  const mergedAliasIds = new Set(merges.flatMap((merge) => merge.aliasIds));
  const translationTargetIds = new Set(venues.filter((venue) => !mergedAliasIds.has(venue.id)).map((venue) => venue.id));
  for (const merge of merges) translationTargetIds.add(merge.canonicalId);
  const translationTargets = [...translationTargetIds].map((id) => venueById.get(id)).filter(Boolean);
  const translationsNeeded = translationTargets.filter((venue) => {
    const translated = translateVenue(venue);
    return translated && (venue.nameHe !== translated.nameHe || venue.cityHe !== translated.cityHe || venue.countryHe !== 'ישראל');
  });
  const imageUpdates = Object.entries(catalog.venueImages).filter(([id, image]) => {
    const venue = venueById.get(id);
    if (!venue) return false;
    const info = venue.additionalInfo && typeof venue.additionalInfo === 'object' ? venue.additionalInfo : {};
    if (venue.imageUrl && venue.imageUrl !== image.url && !REPLACE_IMAGES) return false;
    return venue.imageUrl !== image.url || info.imageSourceUrl !== image.sourceUrl || info.imageLicenseUrl !== image.licenseUrl;
  });
  const imageUpdatesSkipped = Object.entries(catalog.venueImages).filter(([id, image]) => {
    const venue = venueById.get(id);
    return venue?.imageUrl && venue.imageUrl !== image.url && !REPLACE_IMAGES;
  }).length;

  return {
    israeliVenues: venues.length,
    merges,
    aliasVenues: merges.reduce((sum, merge) => sum + merge.aliasIds.length, 0),
    gamesToMove: merges.reduce((sum, merge) => sum + merge.games, 0),
    teamsToMove: merges.reduce((sum, merge) => sum + merge.teams, 0),
    uploadsToMove: merges.reduce((sum, merge) => sum + merge.uploads, 0),
    translationsNeeded: translationsNeeded.length,
    untranslatedIds: translationTargets.filter((venue) => !translateVenue(venue)).map((venue) => venue.id),
    imageUpdates: imageUpdates.length,
    imageUpdatesSkipped,
  };
}

async function execute() {
  return prisma.$transaction(async (tx) => {
    const counters = { games: 0, teams: 0, uploads: 0, deleted: 0, translated: 0, images: 0 };

    for (const entry of catalog.canonicalVenues) {
      const canonical = await tx.venue.findUnique({ where: { id: entry.id } });
      if (!canonical) continue;
      const aliases = await tx.venue.findMany({ where: { id: { in: entry.aliasIds } } });
      const aliasIds = aliases.map((alias) => alias.id);
      const allIds = [entry.id, ...aliasIds];

      if (aliasIds.length) {
        const metadata = mergeVenueMetadata(canonical, aliases);
        if (Object.keys(metadata).length) {
          await tx.venue.update({ where: { id: entry.id }, data: metadata });
        }
        counters.games += (await tx.game.updateMany({
          where: { venueId: { in: aliasIds } },
          data: { venueId: entry.id, venueNameEn: entry.nameEn, venueNameHe: entry.nameHe },
        })).count;
        counters.teams += (await tx.team.updateMany({
          where: { venueId: { in: aliasIds } },
          data: { venueId: entry.id, stadiumEn: entry.nameEn, stadiumHe: entry.nameHe },
        })).count;
        counters.uploads += (await tx.mediaAsset.updateMany({
          where: { venueId: { in: aliasIds } },
          data: { venueId: entry.id },
        })).count;
        counters.deleted += (await tx.venue.deleteMany({ where: { id: { in: aliasIds } } })).count;
      }

      await tx.game.updateMany({
        where: { venueId: { in: allIds } },
        data: { venueNameEn: entry.nameEn, venueNameHe: entry.nameHe },
      });
      await tx.venue.update({
        where: { id: entry.id },
        data: {
          nameEn: entry.nameEn,
          nameHe: entry.nameHe,
          cityEn: entry.cityEn,
          cityHe: entry.cityHe,
          countryEn: 'Israel',
          countryHe: 'ישראל',
        },
      });
    }

    const ids = await israeliVenueIds(tx);
    const venues = await tx.venue.findMany({ where: { id: { in: ids } } });
    for (const venue of venues) {
      const translated = translateVenue(venue);
      if (!translated) continue;
      if (venue.nameHe !== translated.nameHe || venue.cityHe !== translated.cityHe || venue.countryHe !== 'ישראל') {
        await tx.venue.update({
          where: { id: venue.id },
          data: { nameHe: translated.nameHe, cityHe: translated.cityHe, countryEn: 'Israel', countryHe: 'ישראל' },
        });
        await tx.game.updateMany({ where: { venueId: venue.id }, data: { venueNameHe: translated.nameHe } });
        counters.translated++;
      }
    }

    for (const [venueId, image] of Object.entries(catalog.venueImages)) {
      const venue = await tx.venue.findUnique({ where: { id: venueId } });
      if (!venue) continue;
      const additionalInfo = venue.additionalInfo && typeof venue.additionalInfo === 'object' && !Array.isArray(venue.additionalInfo)
        ? venue.additionalInfo
        : {};
      if (venue.imageUrl && venue.imageUrl !== image.url && !REPLACE_IMAGES) continue;
      if (venue.imageUrl === image.url &&
          additionalInfo.imageSourceUrl === image.sourceUrl &&
          additionalInfo.imageLicenseUrl === image.licenseUrl) continue;
      await tx.venue.update({
        where: { id: venueId },
        data: {
          imageUrl: image.url,
          additionalInfo: {
            ...additionalInfo,
            imageSourceUrl: image.sourceUrl,
            imageLicense: image.license,
            imageLicenseUrl: image.licenseUrl,
            imageCredit: image.credit,
          },
        },
      });
      counters.images++;
    }

    const after = await plan(tx);
    if (after.aliasVenues || after.translationsNeeded || after.imageUpdates || after.untranslatedIds.length) {
      throw new Error(`Venue normalization validation failed; transaction rolled back: ${JSON.stringify(after)}`);
    }
    return { counters, after };
  }, { timeout: 120000 });
}

async function main() {
  const before = await plan(prisma);
  console.log(JSON.stringify({ mode: EXECUTE ? 'execute' : 'dry-run', replaceImages: REPLACE_IMAGES, before }, null, 2));
  if (!EXECUTE) return;
  if (before.untranslatedIds.length) throw new Error(`Refusing to run: ${before.untranslatedIds.length} Israeli venues have no Hebrew translation`);

  const result = await execute();
  console.log(JSON.stringify({ result }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
