/**
 * all-time-stats.ts — cross-season leaderboards aggregated from PlayerStatistics
 * keyed by canonical player. PlayerStatistics has the right shape:
 *   1. 17k+ rows covering 2016+ for goals/assists/yellow/red.
 *   2. Updated post-playoff (matches end-of-season totals).
 *   3. Joinable to Player → canonicalPlayer for proper dedup + Hebrew names.
 *
 * Within one (player, season) there can be multiple rows (per competition);
 * we pick MAX per (canonical, season) to avoid double-counting league + cup
 * when a player has both stats.
 */
import prisma from '@/lib/prisma';

export interface AllTimeEntry {
  rank: number;
  canonicalId: string;
  displayName: string;
  photoUrl: string | null;
  total: number;
  seasons: number;
  bestSeason: { seasonName: string; value: number } | null;
  teams: string[];
}

const METRIC_MAP = {
  TOP_SCORERS: 'goals',
  TOP_ASSISTS: 'assists',
  TOP_YELLOW_CARDS: 'yellowCards',
  TOP_RED_CARDS: 'redCards',
} as const;

export type AllTimeCategory = keyof typeof METRIC_MAP;

export async function buildAllTimeLeaderboard(category: AllTimeCategory, limit = 50): Promise<AllTimeEntry[]> {
  const column = METRIC_MAP[category];

  // Pick MAX per (canonical, season) to avoid double-counting across competitions,
  // then SUM per canonical player. Names/photos/teams come from subqueries on
  // the canonical id so we get the most recently updated info per player.
  const rows = await prisma.$queryRawUnsafe<Array<{
    canonical: string;
    name: string | null;
    photo: string | null;
    total: number;
    seasons: number;
    best_value: number;
    best_season_name: string | null;
    teams: string[];
  }>>(`
    WITH per_season AS (
      SELECT
        COALESCE(p."canonicalPlayerId", p.id) AS canonical,
        ps."seasonId",
        MAX(ps."${column}") AS value
      FROM "player_statistics" ps
      JOIN "players" p ON p.id = ps."playerId"
      WHERE ps."${column}" IS NOT NULL AND ps."${column}" > 0
      GROUP BY canonical, ps."seasonId"
    )
    SELECT
      ps.canonical,
      (SELECT COALESCE(p2."nameHe", p2."nameEn") FROM "players" p2
       WHERE COALESCE(p2."canonicalPlayerId", p2.id) = ps.canonical
       ORDER BY p2."updatedAt" DESC LIMIT 1) AS name,
      (SELECT p3."photoUrl" FROM "players" p3
       WHERE COALESCE(p3."canonicalPlayerId", p3.id) = ps.canonical AND p3."photoUrl" IS NOT NULL
       ORDER BY p3."updatedAt" DESC LIMIT 1) AS photo,
      SUM(ps.value)::int AS total,
      COUNT(*)::int AS seasons,
      MAX(ps.value)::int AS best_value,
      (SELECT s.name FROM "seasons" s
       JOIN per_season ps2 ON ps2."seasonId" = s.id
       WHERE ps2.canonical = ps.canonical AND ps2.value = MAX(ps.value)
       LIMIT 1) AS best_season_name,
      (SELECT ARRAY_AGG(DISTINCT COALESCE(t."nameHe", t."nameEn"))
       FROM "players" p4 JOIN "teams" t ON t.id = p4."teamId"
       WHERE COALESCE(p4."canonicalPlayerId", p4.id) = ps.canonical) AS teams
    FROM per_season ps
    GROUP BY ps.canonical
    ORDER BY total DESC
    LIMIT $1
  `, limit);

  return rows.map((r, i) => ({
    rank: i + 1,
    canonicalId: r.canonical,
    displayName: r.name || '—',
    photoUrl: r.photo,
    total: r.total,
    seasons: r.seasons,
    bestSeason: r.best_value > 0 && r.best_season_name ? { seasonName: r.best_season_name, value: r.best_value } : null,
    teams: (r.teams || []).slice(0, 4),
  }));
}
