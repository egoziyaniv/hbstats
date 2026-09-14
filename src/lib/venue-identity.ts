export const TURNER_CANONICAL_VENUE_ID = 'cmoycq3bj000iapure270zz7e';

const TURNER_LEGACY_VENUE_IDS = new Set([
  'cmoycq3a00003apuryts2re7e',
  'cmoycq3bz000oapur26pffweg',
  'cmq5he64z01hm5j5xvpa75p9j',
]);

const TURNER_NAMES = new Set([
  'yaakov turner toto stadium',
  'yaakov turner toto stadium be er sheva beer sheva',
  'toto turner stadium',
  'באר שבע אצטדיון טוטו ע ש טרנר',
  'אצטדיון טוטו טרנר',
]);

function normalizeVenueName(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[׳״'’`\"()]/g, ' ')
    .replace(/[^a-zA-Z0-9\u0590-\u05FF]+/g, ' ')
    .trim()
    .toLowerCase();
}

export type CanonicalVenueIdentity = {
  apiFootballId: number;
  nameEn: string;
  nameHe: string;
  cityEn: string;
  cityHe: string;
};

export function canonicalizeVenueIdentity(input: {
  name: string;
  city?: string | null;
  apiFootballId?: number | null;
}): CanonicalVenueIdentity | null {
  const normalizedName = normalizeVenueName(input.name);
  if (input.apiFootballId !== 867 && !TURNER_NAMES.has(normalizedName)) return null;

  return {
    apiFootballId: 867,
    nameEn: 'Yaakov Turner Toto Stadium',
    nameHe: 'אצטדיון טוטו טרנר',
    cityEn: 'Beer Sheva',
    cityHe: 'באר שבע',
  };
}

export function resolveCanonicalVenueId(venueId: string): string {
  return TURNER_LEGACY_VENUE_IDS.has(venueId) ? TURNER_CANONICAL_VENUE_ID : venueId;
}
