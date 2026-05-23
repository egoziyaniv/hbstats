import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import type { SeasonsPayload } from '@shared/types/mobile-api';

export const dynamic = 'force-dynamic';

export async function GET() {
  const rows = await prisma.$queryRaw<{ id: string; year: number; name: string; game_count: bigint }[]>`
    SELECT s.id, s.year, s.name, COUNT(g.id) AS game_count
    FROM "Season" s
    LEFT JOIN "Game" g ON g."seasonId" = s.id
    GROUP BY s.id, s.year, s.name
    HAVING COUNT(g.id) > 1
    ORDER BY s.year DESC
  `;

  const seasons = rows.map((r) => ({
    id: r.id,
    year: r.year,
    name: r.name,
    gameCount: Number(r.game_count),
  }));

  return NextResponse.json<SeasonsPayload>({ seasons });
}
