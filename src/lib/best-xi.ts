/**
 * best-xi.ts — top 11 players of a season by average rating.
 *
 * Strategy: pull GamePlayerStats grouped by player, filter to a minimum match
 * count, sort by average rating, then bucket by position into 1 GK / 4 DEF /
 * 4 MID / 2 FWD. If we don't have 11 rated players in a season, returns
 * whatever we have.
 */
import prisma from '@/lib/prisma';

export interface BestXiPlayer {
  playerId: string;
  displayName: string;
  photoUrl: string | null;
  position: string;
  posCategory: 'GK' | 'DEF' | 'MID' | 'FWD';
  team: string;
  avgRating: number;
  matches: number;
}

function categorize(position: string | null): 'GK' | 'DEF' | 'MID' | 'FWD' {
  const p = (position || '').toLowerCase();
  if (p.includes('goal') || p === 'gk' || p.includes('שוער')) return 'GK';
  if (p.includes('def') || p.includes('back') || p.includes('בלם') || p.includes('מגן')) return 'DEF';
  if (p.includes('fwd') || p.includes('strik') || p.includes('chalk') || p.includes('חלוץ') || p.includes('מסירה') || p.includes('att')) return 'FWD';
  return 'MID';
}

export async function buildBestXi(seasonId: string, minMatches?: number): Promise<BestXiPlayer[]> {
  // Auto-derive minimum match threshold from the season's heaviest workload —
  // a player must have appeared in at least 50% of the typical workload to
  // qualify, so 5-game cameos can't crash the lineup.
  if (minMatches == null) {
    const max = await prisma.$queryRaw<Array<{ max: number }>>`
      SELECT MAX(matches)::int AS max FROM (
        SELECT COUNT(*) AS matches FROM "game_player_stats" gps
        JOIN "games" g ON g.id = gps."gameId"
        WHERE g."seasonId" = ${seasonId} AND gps.rating IS NOT NULL
        GROUP BY gps."playerId"
      ) t
    `;
    const peak = max[0]?.max || 0;
    minMatches = Math.max(8, Math.floor(peak * 0.5));
  }
  const rows = await prisma.$queryRaw<Array<{
    player_id: string;
    name_he: string;
    name_en: string;
    photo_url: string | null;
    position: string | null;
    team_he: string;
    team_en: string;
    avg_rating: number;
    matches: number;
  }>>`
    SELECT
      p.id AS player_id,
      p."nameHe" AS name_he,
      p."nameEn" AS name_en,
      p."photoUrl" AS photo_url,
      p.position AS position,
      t."nameHe" AS team_he,
      t."nameEn" AS team_en,
      AVG(gps.rating)::float AS avg_rating,
      COUNT(*)::int AS matches
    FROM "game_player_stats" gps
    JOIN "games" g ON g.id = gps."gameId"
    JOIN "players" p ON p.id = gps."playerId"
    JOIN "teams" t ON t.id = p."teamId"
    WHERE g."seasonId" = ${seasonId}
      AND gps.rating IS NOT NULL
      AND gps."playerId" IS NOT NULL
    GROUP BY p.id, p."nameHe", p."nameEn", p."photoUrl", p.position, t."nameHe", t."nameEn"
    HAVING COUNT(*) >= ${minMatches}
    ORDER BY AVG(gps.rating) DESC
  `;

  const candidates: BestXiPlayer[] = rows.map((r) => ({
    playerId: r.player_id,
    displayName: r.name_he || r.name_en,
    photoUrl: r.photo_url,
    position: r.position || '',
    posCategory: categorize(r.position),
    team: r.team_he || r.team_en,
    avgRating: Math.round(r.avg_rating * 10) / 10,
    matches: r.matches,
  }));

  const limits: Record<'GK' | 'DEF' | 'MID' | 'FWD', number> = { GK: 1, DEF: 4, MID: 4, FWD: 2 };
  const picked: BestXiPlayer[] = [];
  const counts = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const c of candidates) {
    if (counts[c.posCategory] < limits[c.posCategory]) {
      picked.push(c);
      counts[c.posCategory]++;
    }
    if (picked.length === 11) break;
  }
  // If we still don't have 11, top up with highest-rated regardless of position.
  if (picked.length < 11) {
    for (const c of candidates) {
      if (picked.includes(c)) continue;
      picked.push(c);
      if (picked.length === 11) break;
    }
  }
  return picked;
}
