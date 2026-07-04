/**
 * /api/mobile/v1/games/[id]/rate — bearer-auth version of the web rate endpoint.
 * Same semantics: one PlayerMatchRating per (game, player, user); resubmit
 * overwrites; rating 1-10 (decimals ok); 0/null deletes.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { submitMatchRatings } from '@/lib/match-ratings';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ ratings: {}, averages: {} });

  const rows = await prisma.playerMatchRating.findMany({
    where: { gameId: params.id, source: 'user', sourceUserId: user.id },
    select: { playerId: true, rating: true },
  });
  const allUserRatings = await prisma.playerMatchRating.groupBy({
    by: ['playerId'],
    where: { gameId: params.id, source: 'user' },
    _avg: { rating: true },
    _count: { _all: true },
  });
  const averages: Record<string, { avg: number; count: number }> = {};
  for (const r of allUserRatings) {
    if (!r.playerId) continue;
    averages[r.playerId] = { avg: r._avg.rating ? Math.round(r._avg.rating * 10) / 10 : 0, count: r._count._all };
  }
  return NextResponse.json({
    ratings: rows.reduce<Record<string, number>>((acc, r) => {
      if (r.playerId) acc[r.playerId] = r.rating;
      return acc;
    }, {}),
    averages,
  });
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: 'התחבר כדי לנקד שחקנים' }, { status: 401 });
  try {
    const body = await request.json();
    const result = await submitMatchRatings(params.id, user.id, body?.ratings);
    if (result.error) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ saved: result.saved, cleared: result.cleared });
  } catch (e: any) {
    console.error('[mobile rate] failed:', e?.message || e);
    return NextResponse.json({ error: 'שמירת הניקוד נכשלה.' }, { status: 400 });
  }
}
