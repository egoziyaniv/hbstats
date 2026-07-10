import prisma from '@/lib/prisma';

/**
 * Club identity — groups per-season Team rows into cross-season club families.
 *
 * Grouping (validated against the DB: 1798 rows → 323 families, one conflict):
 *   1. rows sharing an apiFootballId are one club (stable per club),
 *   2. rows sharing a normalized Hebrew name are one club,
 *   union-find over both signals (handles transliteration drift like Marmorek).
 *
 * clubKey (stable URL slug, matches the admin teamKey convention):
 *   `api-<apiFootballId>` when the family has one, else `name-<encodeURIComponent(nameHe of newest row)>`.
 */

export interface ClubFamily {
  clubKey: string;
  nameHe: string;
  nameEn: string;
  logoUrl: string | null;
  latestTeamId: string;
  teamIds: string[];
  seasons: Array<{ seasonId: string; year: number; teamId: string }>;
}

const CACHE_TTL_MS = 60 * 60 * 1000;
let cache: { at: number; families: ClubFamily[]; byTeamId: Map<string, ClubFamily>; byKey: Map<string, ClubFamily> } | null = null;
export function clearClubCache() { cache = null; }
export const _clearClubCacheForTests = clearClubCache;

// Same normalization family the merge engine uses for team-name matching.
function normalizeName(name: string): string {
  return (name || '')
    .replace(/&#\d+;/g, '')
    .replace(/&\w+;/g, '')
    .replace(/['"״׳\-\.`']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

type TeamRow = {
  id: string; nameHe: string; nameEn: string; logoUrl: string | null;
  apiFootballId: number | null; seasonId: string;
  season: { id: string; year: number };
};

async function build() {
  const rows = (await prisma.team.findMany({
    select: {
      id: true, nameHe: true, nameEn: true, logoUrl: true, apiFootballId: true, seasonId: true,
      season: { select: { id: true, year: true } },
    },
  })) as TeamRow[];

  // Union-find over two signals: apiFootballId and normalized nameHe.
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    // path compression
    let c = x;
    while (parent.get(c) !== r) { const n = parent.get(c)!; parent.set(c, r); c = n; }
    return r;
  };
  const union = (a: string, b: string) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };

  for (const row of rows) parent.set(row.id, row.id);
  const byApi = new Map<number, string>();
  const byName = new Map<string, string>();
  for (const row of rows) {
    if (typeof row.apiFootballId === 'number') {
      const seen = byApi.get(row.apiFootballId);
      if (seen) union(seen, row.id); else byApi.set(row.apiFootballId, row.id);
    }
    const key = normalizeName(row.nameHe);
    if (key) {
      const seen = byName.get(key);
      if (seen) union(seen, row.id); else byName.set(key, row.id);
    }
  }

  const groups = new Map<string, TeamRow[]>();
  for (const row of rows) {
    const root = find(row.id);
    const arr = groups.get(root) || [];
    arr.push(row);
    groups.set(root, arr);
  }

  const families: ClubFamily[] = [];
  for (const members of groups.values()) {
    // Sort newest-first ONCE and reuse it for newest/logo/seasons — logoUrl
    // must come from the newest row that HAS one, not just insertion order.
    const sorted = [...members].sort((a, b) => b.season.year - a.season.year);
    const newest = sorted[0];
    const apiId = members.map((m) => m.apiFootballId).find((x): x is number => typeof x === 'number');
    families.push({
      clubKey: apiId != null ? `api-${apiId}` : `name-${encodeURIComponent(newest.nameHe)}`,
      nameHe: newest.nameHe,
      nameEn: newest.nameEn,
      logoUrl: sorted.map((m) => m.logoUrl).find((l) => l) ?? null,
      latestTeamId: newest.id,
      teamIds: members.map((m) => m.id),
      seasons: sorted.map((m) => ({ seasonId: m.seasonId, year: m.season.year, teamId: m.id })),
    });
  }
  families.sort((a, b) => b.seasons.length - a.seasons.length);

  const byTeamId = new Map<string, ClubFamily>();
  const byKey = new Map<string, ClubFamily>();
  for (const f of families) {
    byKey.set(f.clubKey, f);
    for (const id of f.teamIds) byTeamId.set(id, f);
  }
  cache = { at: Date.now(), families, byTeamId, byKey };
  return cache;
}

async function ensure() {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache;
  return build();
}

export async function getClubFamilies(): Promise<ClubFamily[]> {
  return (await ensure()).families;
}
export async function getClubFamily(clubKey: string): Promise<ClubFamily | null> {
  return (await ensure()).byKey.get(clubKey) ?? null;
}
export async function getClubFamilyByTeamId(teamId: string): Promise<ClubFamily | null> {
  return (await ensure()).byTeamId.get(teamId) ?? null;
}
