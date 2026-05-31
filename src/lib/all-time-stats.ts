/**
 * all-time-stats.ts — cross-season leaderboards aggregated by player name.
 *
 * Data source: `competition_leaderboard_entries` (Walla + IFA). Players are
 * keyed by `playerNameEn` since we don't have a canonical link to Player rows
 * for historical seasons; we display the Hebrew name when stored, otherwise
 * fall back to English.
 */
import prisma from '@/lib/prisma';

export interface AllTimeEntry {
  rank: number;
  playerKey: string;
  displayName: string;
  total: number;
  seasons: number;
  bestSeason: { seasonName: string; value: number } | null;
  teams: string[];
}

const CATEGORIES = ['TOP_SCORERS', 'TOP_ASSISTS', 'TOP_YELLOW_CARDS', 'TOP_RED_CARDS'] as const;
export type AllTimeCategory = (typeof CATEGORIES)[number];

export async function buildAllTimeLeaderboard(category: AllTimeCategory, limit = 50): Promise<AllTimeEntry[]> {
  const rows = await prisma.competitionLeaderboardEntry.findMany({
    where: { category },
    select: {
      playerNameEn: true,
      playerNameHe: true,
      teamNameEn: true,
      teamNameHe: true,
      value: true,
      season: { select: { name: true, year: true } },
    },
  });

  // Group by playerNameEn (cross-season name dedup is messy without a canonical
  // table; we accept some near-duplicates for now).
  type Bucket = {
    displayName: string;
    total: number;
    seasonValues: Array<{ seasonName: string; value: number }>;
    teams: Set<string>;
  };
  const buckets = new Map<string, Bucket>();
  for (const r of rows) {
    if (!r.playerNameEn || r.value == null) continue;
    let b = buckets.get(r.playerNameEn);
    if (!b) {
      b = { displayName: r.playerNameHe || r.playerNameEn, total: 0, seasonValues: [], teams: new Set() };
      buckets.set(r.playerNameEn, b);
    }
    if (r.playerNameHe && !/[A-Za-z]/.test(r.playerNameHe)) b.displayName = r.playerNameHe;
    b.total += r.value;
    b.seasonValues.push({ seasonName: r.season.name, value: r.value });
    if (r.teamNameHe || r.teamNameEn) b.teams.add(r.teamNameHe || r.teamNameEn);
  }

  const result: AllTimeEntry[] = [];
  for (const [key, b] of buckets) {
    const best = b.seasonValues.reduce((acc, cur) => (cur.value > acc.value ? cur : acc), b.seasonValues[0]);
    result.push({
      rank: 0,
      playerKey: key,
      displayName: b.displayName,
      total: b.total,
      seasons: b.seasonValues.length,
      bestSeason: best,
      teams: Array.from(b.teams).slice(0, 4),
    });
  }
  result.sort((a, b) => b.total - a.total);
  result.forEach((r, i) => { r.rank = i + 1; });
  return result.slice(0, limit);
}
