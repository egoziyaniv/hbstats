/**
 * /api/mobile/v1/games/[id]/rate — bearer-auth version of the web rate endpoint.
 * Same semantics: one PlayerMatchRating per (game, player, user); resubmit
 * overwrites; rating 1-10 (decimals ok); 0/null deletes.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

interface RatingInput { playerId: string; rating: number | null }

const MAX_RATINGS = 60; // a lineup is ~11 starters + subs; cap abuse

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
    const ratings = Array.isArray(body.ratings) ? (body.ratings as RatingInput[]) : null;
    if (!ratings) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
    if (ratings.length > MAX_RATINGS) return NextResponse.json({ error: 'Too many ratings' }, { status: 400 });

    const game = await prisma.game.findUnique({ where: { id: params.id }, select: { id: true, status: true } });
    if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    if (game.status !== 'COMPLETED' && game.status !== 'ONGOING') {
      return NextResponse.json({ error: 'אפשר לנקד רק משחקים ששוחקו.' }, { status: 400 });
    }

    let saved = 0, cleared = 0;
    for (const r of ratings) {
      const playerId = String(r.playerId || '').trim();
      if (!playerId) continue;
      const raw = r.rating;
      if (raw == null || raw === 0) {
        const existing = await prisma.playerMatchRating.findFirst({
          where: { gameId: params.id, playerId, source: 'user', sourceUserId: user.id },
          select: { id: true },
        });
        if (existing) { await prisma.playerMatchRating.delete({ where: { id: existing.id } }); cleared++; }
        continue;
      }
      const value = Number(raw);
      if (!Number.isFinite(value) || value < 1 || value > 10) continue;
      const existing = await prisma.playerMatchRating.findFirst({
        where: { gameId: params.id, playerId, source: 'user', sourceUserId: user.id },
        select: { id: true },
      });
      if (existing) {
        await prisma.playerMatchRating.update({ where: { id: existing.id }, data: { rating: value } });
      } else {
        await prisma.playerMatchRating.create({ data: { gameId: params.id, playerId, source: 'user', sourceUserId: user.id, rating: value } });
      }
      saved++;
    }
    return NextResponse.json({ saved, cleared });
  } catch (e: any) {
    console.error('[mobile rate] failed:', e?.message || e);
    return NextResponse.json({ error: 'שמירת הניקוד נכשלה.' }, { status: 400 });
  }
}
