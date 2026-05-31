/**
 * predicted-lineup.ts — predict the starting XI for a SCHEDULED game based
 * on the team's recent starting-lineup frequency.
 *
 * Method: walk the last N completed games for the team in the same season,
 * count how often each player started, and pick the top 11 by frequency
 * (subject to the team's typical formation pattern). When a player started
 * in 4 of the last 5 games, they're an obvious lock; we surface confidence
 * alongside each pick.
 */
import prisma from '@/lib/prisma';

export interface PredictedPlayer {
  playerId: string;
  displayName: string;
  photoUrl: string | null;
  position: string | null;
  posCategory: 'GK' | 'DEF' | 'MID' | 'FWD';
  jerseyNumber: number | null;
  startsInLast5: number; // 0..5
  totalGamesConsidered: number;
}

function categorize(position: string | null): 'GK' | 'DEF' | 'MID' | 'FWD' {
  const p = (position || '').toLowerCase();
  if (p.includes('goal') || p === 'gk' || p.includes('שוער')) return 'GK';
  if (p.includes('def') || p.includes('back') || p.includes('בלם') || p.includes('מגן')) return 'DEF';
  if (p.includes('att') || p.includes('strik') || p.includes('forward') || p.includes('חלוץ')) return 'FWD';
  return 'MID';
}

export async function buildPredictedLineup(teamId: string, beforeDateTime?: Date, lookback = 5): Promise<PredictedPlayer[]> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { id: true, seasonId: true, nameHe: true },
  });
  if (!team) return [];

  // Take the team's most recent completed games BEFORE the upcoming match.
  const recent = await prisma.game.findMany({
    where: {
      seasonId: team.seasonId,
      status: 'COMPLETED',
      OR: [{ homeTeamId: team.id }, { awayTeamId: team.id }],
      ...(beforeDateTime ? { dateTime: { lt: beforeDateTime } } : {}),
    },
    orderBy: { dateTime: 'desc' },
    take: lookback,
    select: { id: true },
  });
  if (recent.length === 0) return [];
  const gameIds = recent.map((g) => g.id);

  // For each player on this team who started in any of these games, count
  // starts. Also fetch their identity for display.
  const rows = await prisma.$queryRaw<Array<{
    player_id: string;
    name_he: string | null;
    name_en: string | null;
    photo: string | null;
    position: string | null;
    jersey: number | null;
    starts: number;
  }>>`
    SELECT
      p.id AS player_id,
      p."nameHe" AS name_he,
      p."nameEn" AS name_en,
      p."photoUrl" AS photo,
      p.position AS position,
      p."jerseyNumber" AS jersey,
      COUNT(*)::int AS starts
    FROM "game_lineup_entries" gle
    JOIN "players" p ON p.id = gle."playerId"
    WHERE gle."gameId" = ANY(${gameIds}::text[])
      AND gle."teamId" = ${team.id}
      AND gle.role = 'STARTER'
    GROUP BY p.id, p."nameHe", p."nameEn", p."photoUrl", p.position, p."jerseyNumber"
    ORDER BY starts DESC
  `;

  const candidates: PredictedPlayer[] = rows.map((r) => ({
    playerId: r.player_id,
    displayName: r.name_he || r.name_en || '—',
    photoUrl: r.photo,
    position: r.position,
    posCategory: categorize(r.position),
    jerseyNumber: r.jersey,
    startsInLast5: r.starts,
    totalGamesConsidered: recent.length,
  }));

  // Fill the lineup according to standard formation slots. If a team has many
  // candidates in one position group, we take the most-frequent starters.
  const limits = { GK: 1, DEF: 4, MID: 4, FWD: 2 } as const;
  const picked: PredictedPlayer[] = [];
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
