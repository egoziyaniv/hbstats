import prisma from '@/lib/prisma';

/**
 * Club identity — groups per-season Team rows into cross-season club families.
 *
 * Grouping (validated against the DB: 1798 rows → 323 families, one conflict):
 *   1. rows sharing an apiFootballId are one club (stable per club),
 *   2. rows sharing a normalized Hebrew name are one club,
 *   union-find over both signals (handles transliteration drift like Marmorek).
 *
 * clubKey (stable URL slug): `api-<apiFootballId>` when the family has one
 * (picked from the newest row that has an apiId — deterministic), else
 * `name-<encodeURIComponent(nameHe of newest row)>`, else `team-<newest row id>`
 * when the name is blank. api- keys interoperate with the admin teamKey
 * convention; name- keys are this module's own (nameHe-based — admin resolves
 * name-<x> against nameEn, so they are NOT interchangeable).
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
export function clearClubCache() { cache = null; currentLeagueCache = null; }
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
  const rows: TeamRow[] = await prisma.team.findMany({
    select: {
      id: true, nameHe: true, nameEn: true, logoUrl: true, apiFootballId: true, seasonId: true,
      season: { select: { id: true, year: true } },
    },
  });

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
    // Sort newest-first ONCE (id tie-break keeps same-year ordering stable
    // across rebuilds) and reuse it for newest/apiId/logo/seasons — each must
    // come from the newest qualifying row, not DB insertion order.
    const sorted = [...members].sort((a, b) => b.season.year - a.season.year || a.id.localeCompare(b.id));
    const newest = sorted[0];
    const apiId = sorted.find((m) => m.apiFootballId != null)?.apiFootballId ?? null;
    const distinctApiIds = new Set(members.map((m) => m.apiFootballId).filter((x) => x != null));
    if (distinctApiIds.size > 1) {
      console.warn('[club-identity] family with multiple apiFootballIds:', newest.nameHe, [...distinctApiIds]);
    }
    const nameKey = newest.nameHe.trim()
      ? `name-${encodeURIComponent(newest.nameHe)}`
      : `team-${newest.id}`;
    families.push({
      clubKey: apiId != null ? `api-${apiId}` : nameKey,
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
/** Bulk teamId → family index — one call for aggregators that map many rows. */
export async function getClubTeamIndex(): Promise<ReadonlyMap<string, ClubFamily>> {
  return (await ensure()).byTeamId;
}

/**
 * Club families of the CURRENT Ligat Ha'al season — for club pickers that
 * should offer only top-flight clubs (e.g. the record book's club filter).
 * "Current" = the newest season that has league standings rows. Sorted by
 * family season-count desc (big clubs first). 1h-cached via the same store.
 */
let currentLeagueCache: { at: number; families: ClubFamily[] } | null = null;
export async function getCurrentLeagueClubFamilies(): Promise<ClubFamily[]> {
  if (currentLeagueCache && Date.now() - currentLeagueCache.at < CACHE_TTL_MS) return currentLeagueCache.families;
  const newest = await prisma.standing.findFirst({
    where: { competitionId: 'comp_liga_haal' },
    orderBy: { season: { year: 'desc' } },
    select: { seasonId: true },
  });
  if (!newest) return [];
  const rows = await prisma.standing.findMany({
    where: { competitionId: 'comp_liga_haal', seasonId: newest.seasonId },
    select: { teamId: true },
  });
  const index = await getClubTeamIndex();
  const seen = new Set<string>();
  const families: ClubFamily[] = [];
  for (const r of rows) {
    const fam = index.get(r.teamId);
    if (fam && !seen.has(fam.clubKey)) {
      seen.add(fam.clubKey);
      families.push(fam);
    }
  }
  families.sort((a, b) => b.seasons.length - a.seasons.length);
  currentLeagueCache = { at: Date.now(), families };
  return families;
}
