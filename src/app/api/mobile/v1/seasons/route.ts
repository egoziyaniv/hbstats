import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import type { SeasonsPayload } from '@shared/types/mobile-api';

export const dynamic = 'force-dynamic';

export async function GET() {
  const all = await prisma.season.findMany({
    orderBy: { year: 'desc' },
    select: {
      id: true,
      year: true,
      name: true,
      _count: { select: { games: true } },
    },
  });

  const seasons = all
    .filter((s) => s._count.games > 1)
    .map((s) => ({ id: s.id, year: s.year, name: s.name, gameCount: s._count.games }));

  return NextResponse.json<SeasonsPayload>({ seasons });
}
