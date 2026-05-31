/**
 * player-ratings.ts — unified rating layer + Best XI / Matchday XI selection.
 *
 * Ratings flow:
 *   1. Per-source ratings live in PlayerMatchRating (gameId, playerId, source).
 *   2. The "unified rating" for a (game, player) is the simple mean across
 *      whatever sources have data — clamp to 0-10.
 *
 * Season Best XI uses the cumulative formula the user specified:
 *   score = SUM(unified ratings) / total_matchdays_played_in_league
 *
 * This penalises players who miss matches (the denominator grows for everyone
 * each round) without rewarding flash-in-the-pan one-game heroes.
 *
 * Matchday XI = top per position in a specific matchday (round) only.
 */
import prisma from '@/lib/prisma';

export interface BestXiPlayer {
  playerId: string;
  displayName: string;
  photoUrl: string | null;
  position: string;
  posCategory: 'GK' | 'DEF' | 'MID' | 'FWD';
  team: string;
  unifiedRating: number | null;
  matchesRated: number;
  goals: number;
  assists: number;
  cumulativeScore: number; // for season XI
  reason: string; // human-readable why they're here
}

function categorize(position: string | null): 'GK' | 'DEF' | 'MID' | 'FWD' {
  const p = (position || '').toLowerCase();
  if (p.includes('goal') || p === 'gk' || p.includes('שוער')) return 'GK';
  if (p.includes('def') || p.includes('back') || p.includes('בלם') || p.includes('מגן')) return 'DEF';
  if (p.includes('att') || p.includes('strik') || p.includes('forward') || p.includes('חלוץ')) return 'FWD';
  return 'MID';
}

function fillLineup(candidates: BestXiPlayer[]): BestXiPlayer[] {
  const limits = { GK: 1, DEF: 4, MID: 4, FWD: 2 } as const;
  const picked: BestXiPlayer[] = [];
  const counts = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const c of candidates) {
    if (counts[c.posCategory] < limits[c.posCategory]) {
      picked.push(c);
      counts[c.posCategory]++;
    }
    if (picked.length === 11) break;
  }
  if (picked.length < 11) {
    for (const c of candidates) {
      if (picked.includes(c)) continue;
      picked.push(c);
      if (picked.length === 11) break;
    }
  }
  return picked;
}

/**
 * Season XI — cumulative formula.
 * For each canonical player: sum unified per-match ratings, divide by total
 * matchdays played in the league so far. Goals/assists shown for context.
 */
export async function buildSeasonXi(seasonId: string): Promise<BestXiPlayer[]> {
  // Total matchdays played in this season — distinct rounds among completed
  // league games. This is the denominator.
  const matchdayResult = await prisma.$queryRaw<Array<{ matchdays: number }>>`
    SELECT COUNT(DISTINCT g."roundNameEn")::int AS matchdays
    FROM "games" g
    WHERE g."seasonId" = ${seasonId} AND g.status = 'COMPLETED'
  `;
  const totalMatchdays = Math.max(1, matchdayResult[0]?.matchdays || 1);

  const rows = await prisma.$queryRaw<Array<{
    canonical: string;
    name: string;
    photo: string | null;
    position: string | null;
    team: string | null;
    rating_sum: number;
    matches_rated: number;
    goals: number;
    assists: number;
  }>>`
    WITH per_game AS (
      SELECT
        COALESCE(p."canonicalPlayerId", p.id) AS canonical,
        pmr."gameId",
        AVG(pmr.rating)::float AS unified_rating
      FROM "player_match_ratings" pmr
      JOIN "players" p ON p.id = pmr."playerId"
      JOIN "games" g ON g.id = pmr."gameId"
      WHERE g."seasonId" = ${seasonId} AND g.status = 'COMPLETED'
      GROUP BY canonical, pmr."gameId"
    ),
    rating_agg AS (
      SELECT canonical, SUM(unified_rating)::float AS rating_sum, COUNT(*)::int AS matches_rated
      FROM per_game
      GROUP BY canonical
    ),
    stats_agg AS (
      SELECT
        COALESCE(p."canonicalPlayerId", p.id) AS canonical,
        MAX(ps.goals)::int AS goals,
        MAX(ps.assists)::int AS assists
      FROM "player_statistics" ps
      JOIN "players" p ON p.id = ps."playerId"
      WHERE ps."seasonId" = ${seasonId}
      GROUP BY canonical
    ),
    merged AS (
      SELECT canonical FROM rating_agg UNION SELECT canonical FROM stats_agg
    )
    SELECT
      m.canonical,
      (SELECT COALESCE(p2."nameHe", p2."nameEn") FROM "players" p2
       WHERE COALESCE(p2."canonicalPlayerId", p2.id) = m.canonical
       ORDER BY p2."updatedAt" DESC LIMIT 1) AS name,
      (SELECT p3."photoUrl" FROM "players" p3
       WHERE COALESCE(p3."canonicalPlayerId", p3.id) = m.canonical AND p3."photoUrl" IS NOT NULL
       ORDER BY p3."updatedAt" DESC LIMIT 1) AS photo,
      (SELECT p4.position FROM "players" p4
       WHERE COALESCE(p4."canonicalPlayerId", p4.id) = m.canonical AND p4.position IS NOT NULL
       ORDER BY p4."updatedAt" DESC LIMIT 1) AS position,
      (SELECT COALESCE(t."nameHe", t."nameEn") FROM "players" p5
       JOIN "teams" t ON t.id = p5."teamId"
       WHERE COALESCE(p5."canonicalPlayerId", p5.id) = m.canonical AND t."seasonId" = ${seasonId}
       ORDER BY p5."updatedAt" DESC LIMIT 1) AS team,
      COALESCE(ra.rating_sum, 0) AS rating_sum,
      COALESCE(ra.matches_rated, 0) AS matches_rated,
      COALESCE(sa.goals, 0) AS goals,
      COALESCE(sa.assists, 0) AS assists
    FROM merged m
    LEFT JOIN rating_agg ra ON ra.canonical = m.canonical
    LEFT JOIN stats_agg sa ON sa.canonical = m.canonical
  `;

  const candidates: BestXiPlayer[] = rows
    .map((r) => {
      // Cumulative score per the user's formula. When rating data is missing
      // we approximate from goals/assists (each goal = +0.5 rating bonus per
      // match, each assist = +0.3) so high-output players who lack rating
      // data still rank reasonably.
      let ratingSum = r.rating_sum;
      let matchesRated = r.matches_rated;
      if (matchesRated === 0 && (r.goals > 0 || r.assists > 0)) {
        // Fallback: synthesize a baseline season output from goal contributions.
        ratingSum = r.goals * 0.5 + r.assists * 0.3;
        matchesRated = Math.max(1, r.goals + r.assists);
      }
      const cumulative = ratingSum / totalMatchdays;
      const unified = matchesRated > 0 ? ratingSum / matchesRated : null;
      const parts: string[] = [];
      if (r.goals > 0) parts.push(`${r.goals} שערים`);
      if (r.assists > 0) parts.push(`${r.assists} בישולים`);
      if (unified != null) parts.push(`ציון ${unified.toFixed(2)}`);
      return {
        playerId: r.canonical,
        displayName: r.name || '—',
        photoUrl: r.photo,
        position: r.position || '',
        posCategory: categorize(r.position),
        team: r.team || '—',
        unifiedRating: unified != null ? Math.round(unified * 100) / 100 : null,
        matchesRated,
        goals: r.goals,
        assists: r.assists,
        cumulativeScore: Math.round(cumulative * 100) / 100,
        reason: parts.join(' · '),
      };
    })
    .filter((p) => p.displayName !== '—' && p.team !== '—')
    .sort((a, b) => b.cumulativeScore - a.cumulativeScore);

  return fillLineup(candidates);
}

/**
 * Matchday XI — top per position based on unified ratings from a specific
 * matchday only.
 */
export async function buildMatchdayXi(seasonId: string, matchday: string): Promise<BestXiPlayer[]> {
  const rows = await prisma.$queryRaw<Array<{
    canonical: string;
    name: string;
    photo: string | null;
    position: string | null;
    team: string | null;
    unified_rating: number;
    goals: number;
    assists: number;
  }>>`
    SELECT
      COALESCE(p."canonicalPlayerId", p.id) AS canonical,
      COALESCE(p."nameHe", p."nameEn") AS name,
      p."photoUrl" AS photo,
      p.position AS position,
      COALESCE(t."nameHe", t."nameEn") AS team,
      AVG(pmr.rating)::float AS unified_rating,
      MAX(COALESCE(gps.goals, 0))::int AS goals,
      MAX(COALESCE(gps.assists, 0))::int AS assists
    FROM "player_match_ratings" pmr
    JOIN "players" p ON p.id = pmr."playerId"
    LEFT JOIN "teams" t ON t.id = p."teamId"
    JOIN "games" g ON g.id = pmr."gameId"
    LEFT JOIN "game_player_stats" gps ON gps."gameId" = pmr."gameId" AND gps."playerId" = pmr."playerId"
    WHERE g."seasonId" = ${seasonId}
      AND g."roundNameEn" = ${matchday}
      AND g.status = 'COMPLETED'
    GROUP BY canonical, p."nameHe", p."nameEn", p."photoUrl", p.position, t."nameHe", t."nameEn"
  `;

  const candidates: BestXiPlayer[] = rows
    .map((r) => ({
      playerId: r.canonical,
      displayName: r.name || '—',
      photoUrl: r.photo,
      position: r.position || '',
      posCategory: categorize(r.position),
      team: r.team || '—',
      unifiedRating: Math.round(r.unified_rating * 100) / 100,
      matchesRated: 1,
      goals: r.goals,
      assists: r.assists,
      cumulativeScore: r.unified_rating,
      reason: `ציון ${r.unified_rating.toFixed(2)}${r.goals > 0 ? ` · ${r.goals} שערים` : ''}${r.assists > 0 ? ` · ${r.assists} בישולים` : ''}`,
    }))
    .filter((p) => p.displayName !== '—')
    .sort((a, b) => (b.unifiedRating || 0) - (a.unifiedRating || 0));

  return fillLineup(candidates);
}

/**
 * List all matchdays played so far in a season (latest first).
 */
export async function listSeasonMatchdays(seasonId: string): Promise<Array<{ roundNameEn: string; roundNameHe: string | null; gamesPlayed: number; latestDate: Date }>> {
  const rows = await prisma.$queryRaw<Array<{
    round_en: string;
    round_he: string | null;
    games: number;
    latest: Date;
  }>>`
    SELECT
      g."roundNameEn" AS round_en,
      MAX(g."roundNameHe") AS round_he,
      COUNT(*)::int AS games,
      MAX(g."dateTime") AS latest
    FROM "games" g
    WHERE g."seasonId" = ${seasonId} AND g.status = 'COMPLETED' AND g."roundNameEn" IS NOT NULL
    GROUP BY g."roundNameEn"
    ORDER BY MAX(g."dateTime") DESC
  `;
  return rows.map((r) => ({
    roundNameEn: r.round_en,
    roundNameHe: r.round_he,
    gamesPlayed: r.games,
    latestDate: r.latest,
  }));
}
