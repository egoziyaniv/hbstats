/**
 * all-time-stats.ts — cross-season leaderboards.
 *
 * Two data eras coexist:
 *   - **2016+**: PlayerStatistics — comprehensive, canonical-keyed, includes
 *     playoff totals. Joins through Player → canonicalPlayer for Hebrew names.
 *   - **2000-2015**: scraped_leaderboards (Walla) — top-5 per season only,
 *     keyed by plain text name. Best-effort lookup for player linking.
 *
 * Within one (player, season) there can be multiple PlayerStatistics rows
 * (per competition); we pick MAX per (canonical, season) to avoid double
 * counting when a player has both league + cup stats.
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

// ── Walla historical (pre-2016) ─────────────────────────────────────────────
const WALLA_CATEGORY: Record<AllTimeCategory, string> = {
  TOP_SCORERS: 'goals',
  TOP_ASSISTS: 'assists',
  TOP_YELLOW_CARDS: 'yellowCards',
  TOP_RED_CARDS: 'redCards',
};

export interface WallaHistoricalEntry {
  rank: number;
  season: string;
  playerName: string;
  teamName: string;
  value: number;
}

export async function buildWallaHistorical(category: AllTimeCategory): Promise<WallaHistoricalEntry[]> {
  const wallaCat = WALLA_CATEGORY[category];
  const rows = await prisma.scrapedLeaderboard.findMany({
    where: { source: 'walla', category: wallaCat },
    orderBy: [{ season: 'desc' }, { rank: 'asc' }],
    select: { season: true, playerName: true, teamName: true, value: true, rank: true },
  });
  return rows.map((r) => ({
    rank: r.rank,
    season: r.season,
    playerName: r.playerName,
    teamName: r.teamName,
    value: Math.round(r.value),
  }));
}
