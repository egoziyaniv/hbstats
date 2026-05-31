/**
 * best-xi.ts — top 11 players of a season ranked by a composite performance
 * score that combines multiple signals:
 *
 *   score = (avgRating × matchesRated) + goals × 3 + assists × 2 + keyPasses × 0.3
 *
 * Why composite, not just rating? API-Football rating coverage is sparse —
 * top scorers like Yarden Shua may have 0 rated games while still leading the
 * league in goals/assists. By blending the season's PlayerStatistics totals
 * (where goals/assists/keyPasses are well-populated) with per-game ratings
 * (when available), we surface the players who actually drove the season.
 *
 * Position assignment uses the latest Player.position string, normalised to
 * GK / DEF / MID / FWD. We allocate 1/4/4/2 slots respectively, falling back
 * to whoever is left when a position is short on candidates.
 */
import prisma from '@/lib/prisma';

export interface BestXiPlayer {
  playerId: string;
  displayName: string;
  photoUrl: string | null;
  position: string;
  posCategory: 'GK' | 'DEF' | 'MID' | 'FWD';
  team: string;
  avgRating: number | null;
  matches: number;
  goals: number;
  assists: number;
  score: number;
}

function categorize(position: string | null): 'GK' | 'DEF' | 'MID' | 'FWD' {
  const p = (position || '').toLowerCase();
  if (p.includes('goal') || p === 'gk' || p.includes('שוער')) return 'GK';
  if (p.includes('def') || p.includes('back') || p.includes('בלם') || p.includes('מגן')) return 'DEF';
  if (p.includes('att') || p.includes('strik') || p.includes('forward') || p.includes('חלוץ')) return 'FWD';
  return 'MID';
}

export async function buildBestXi(seasonId: string): Promise<BestXiPlayer[]> {
  // Pull season totals from PlayerStatistics (best coverage) PLUS aggregated
  // GamePlayerStats for rating + match count. We then merge by canonical
  // player. To avoid double-counting when the same player has multiple
  // PlayerStatistics rows (one per competition), we pick MAX per metric per
  // (canonical, season).
  const rows = await prisma.$queryRaw<Array<{
    canonical: string;
    name: string;
    photo: string | null;
    position: string | null;
    team: string | null;
    matches_rated: number;
    avg_rating: number | null;
    goals: number;
    assists: number;
    key_passes: number;
    games_played: number;
  }>>`
    WITH agg_ps AS (
      SELECT
        COALESCE(p."canonicalPlayerId", p.id) AS canonical,
        MAX(ps.goals)::int AS goals,
        MAX(ps.assists)::int AS assists,
        MAX(ps."keyPasses")::int AS key_passes,
        MAX(ps."gamesPlayed")::int AS games_played
      FROM "player_statistics" ps
      JOIN "players" p ON p.id = ps."playerId"
      WHERE ps."seasonId" = ${seasonId}
      GROUP BY canonical
    ),
    agg_gps AS (
      SELECT
        COALESCE(p."canonicalPlayerId", p.id) AS canonical,
        AVG(gps.rating)::float AS avg_rating,
        COUNT(*)::int AS matches_rated
      FROM "game_player_stats" gps
      JOIN "games" g ON g.id = gps."gameId"
      JOIN "players" p ON p.id = gps."playerId"
      WHERE g."seasonId" = ${seasonId} AND gps.rating IS NOT NULL
      GROUP BY canonical
    ),
    merged AS (
      SELECT canonical FROM agg_ps UNION SELECT canonical FROM agg_gps
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
       LIMIT 1) AS team,
      COALESCE(g.matches_rated, 0)::int AS matches_rated,
      g.avg_rating AS avg_rating,
      COALESCE(s.goals, 0)::int AS goals,
      COALESCE(s.assists, 0)::int AS assists,
      COALESCE(s.key_passes, 0)::int AS key_passes,
      COALESCE(s.games_played, 0)::int AS games_played
    FROM merged m
    LEFT JOIN agg_ps s ON s.canonical = m.canonical
    LEFT JOIN agg_gps g ON g.canonical = m.canonical
  `;

  const peakGames = Math.max(0, ...rows.map((r) => Math.max(r.games_played, r.matches_rated)));
  const minMatches = Math.max(10, Math.floor(peakGames * 0.4));

  // Score players. Players without rating still get scored on raw output.
  const candidates: BestXiPlayer[] = rows
    .map((r) => {
      const matches = Math.max(r.games_played, r.matches_rated);
      const rating = r.avg_rating != null ? r.avg_rating : null;
      const ratingScore = rating != null ? rating * r.matches_rated : 0;
      const score = ratingScore + r.goals * 3 + r.assists * 2 + r.key_passes * 0.3;
      return {
        playerId: r.canonical,
        displayName: r.name || '—',
        photoUrl: r.photo,
        position: r.position || '',
        posCategory: categorize(r.position),
        team: r.team || '—',
        avgRating: rating != null ? Math.round(rating * 10) / 10 : null,
        matches,
        goals: r.goals,
        assists: r.assists,
        score,
      };
    })
    .filter((p) => p.matches >= minMatches && p.team !== '—' && p.displayName !== '—')
    .sort((a, b) => b.score - a.score);

  // Pick by formation: 1 GK, 4 DEF, 4 MID, 2 FWD. If a slot is short, top up
  // from the remaining best-overall pool.
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
