import venueCatalog from '@/data/israeli-venue-catalog.json';

type VenueCatalogEntry = {
  id: string;
  apiFootballId: number | null;
  nameEn: string;
  nameHe: string;
  cityEn: string | null;
  cityHe: string | null;
  cityAliases: string[];
  aliasIds: string[];
  apiFootballAliases: number[];
  nameAliases: string[];
};

const entries = venueCatalog.canonicalVenues as VenueCatalogEntry[];

function normalizeVenueName(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[׳״'’`\"()]/g, ' ')
    .replace(/[^a-zA-Z0-9\u0590-\u05FF]+/g, ' ')
    .trim()
    .toLowerCase();
}

const byApiFootballId = new Map<number, VenueCatalogEntry>();
const byName = new Map<string, VenueCatalogEntry[]>();
const canonicalIdByLegacyId = new Map<string, string>();

for (const entry of entries) {
  if (entry.apiFootballId != null) byApiFootballId.set(entry.apiFootballId, entry);
  for (const aliasId of entry.apiFootballAliases) byApiFootballId.set(aliasId, entry);
  for (const aliasName of entry.nameAliases) {
    const key = normalizeVenueName(aliasName);
    byName.set(key, [...(byName.get(key) || []), entry]);
  }
  for (const aliasId of entry.aliasIds) canonicalIdByLegacyId.set(aliasId, entry.id);
}

export type CanonicalVenueIdentity = {
  id: string;
  apiFootballId: number | null;
  nameEn: string;
  nameHe: string;
  cityEn: string | null;
  cityHe: string | null;
};

export function canonicalizeVenueIdentity(input: {
  name: string;
  city?: string | null;
  apiFootballId?: number | null;
}): CanonicalVenueIdentity | null {
  const apiMatch = input.apiFootballId != null ? byApiFootballId.get(input.apiFootballId) : undefined;
  const nameMatches = byName.get(normalizeVenueName(input.name)) || [];
  const normalizedCity = input.city ? normalizeVenueName(input.city) : null;
  const nameMatch = normalizedCity
    ? nameMatches.find((candidate) => candidate.cityAliases.some((city) => normalizeVenueName(city) === normalizedCity))
    : nameMatches.length === 1 ? nameMatches[0] : undefined;
  const entry = apiMatch || nameMatch;
  if (!entry) return null;
  return {
    id: entry.id,
    apiFootballId: entry.apiFootballId,
    nameEn: entry.nameEn,
    nameHe: entry.nameHe,
    cityEn: entry.cityEn,
    cityHe: entry.cityHe,
  };
}

export function resolveCanonicalVenueId(venueId: string): string {
  return canonicalIdByLegacyId.get(venueId) || venueId;
}
