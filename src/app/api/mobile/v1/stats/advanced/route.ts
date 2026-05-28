import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import type { AdvancedLeaderboardEntry, AdvancedLeaderboardsPayload } from '@shared/types/mobile-api';

export const dynamic = 'force-dynamic';

async function buildBoard(seasonId: string, metric: 'passesKey' | 'duelsWon' | 'dribblesSuccess'): Promise<AdvancedLeaderboardEntry[]> {
  const rows = await prisma.$queryRawUnsafe<Array<{ canon: string; total: number; matches: number; name: string; team: string }>>(`
    SELECT
      COALESCE(p."canonicalPlayerId", p.id) AS canon,
      SUM(COALESCE(gs."${metric}", 0))::int AS total,
      COUNT(DISTINCT gs."gameId")::int AS matches,
      MAX(COALESCE(p."nameHe", p."nameEn", gs."playerName"))::text AS name,
      MAX(COALESCE(t."nameHe", t."nameEn"))::text AS team
    FROM "game_player_stats" gs
    JOIN "games" g ON g.id = gs."gameId" AND g."seasonId" = $1
    LEFT JOIN "players" p ON p.id = gs."playerId"
    LEFT JOIN "teams" t ON t.id = p."teamId"
    WHERE gs."${metric}" IS NOT NULL
    GROUP BY canon
    HAVING SUM(COALESCE(gs."${metric}", 0)) > 0
    ORDER BY total DESC
    LIMIT 15
  `, seasonId);
  return rows.map((r) => ({ canonicalId: r.canon, name: r.name || '—', team: r.team || '—', value: r.total, matches: r.matches }));
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const yearParam = searchParams.get('year');
  const seasonYear = yearParam ? parseInt(yearParam, 10) : undefined;
  const season = seasonYear != null
    ? await prisma.season.findFirst({ where: { year: seasonYear } })
    : await prisma.season.findFirst({ orderBy: { year: 'desc' } });
  if (!season) return NextResponse.json({ error: 'no season' }, { status: 404 });

  const [keyPasses, duelsWon, dribblesSuccess] = await Promise.all([
    buildBoard(season.id, 'passesKey'),
    buildBoard(season.id, 'duelsWon'),
    buildBoard(season.id, 'dribblesSuccess'),
  ]);

  return NextResponse.json<AdvancedLeaderboardsPayload>({
    season: { id: season.id, year: season.year, name: season.name },
    keyPasses, duelsWon, dribblesSuccess,
  });
}
