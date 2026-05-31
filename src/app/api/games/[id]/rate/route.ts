/**
 * /api/games/[id]/rate — authenticated user submits per-player ratings.
 *
 * Each (game, player, user) combination saves a single PlayerMatchRating row
 * with source='user' and sourceUserId=<user.id>. Resubmitting overwrites.
 *
 * Body shape: { ratings: [{ playerId, rating }] }
 *   rating must be 1-10 (allow decimals like 7.5). 0/null deletes.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import prisma from '@/lib/prisma';

interface RatingInput { playerId: string; rating: number | null }

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ratings: [], averages: {} });
  const rows = await prisma.playerMatchRating.findMany({
    where: { gameId: params.id, source: 'user', sourceUserId: user.id },
    select: { playerId: true, rating: true },
  });
  // Aggregate averages across ALL users for each player.
  const allUserRatings = await prisma.playerMatchRating.groupBy({
    by: ['playerId'],
    where: { gameId: params.id, source: 'user' },
    _avg: { rating: true },
    _count: { _all: true },
  });
  const averages: Record<string, { avg: number; count: number }> = {};
  for (const r of allUserRatings) {
    if (!r.playerId) continue;
    averages[r.playerId] = {
      avg: r._avg.rating ? Math.round(r._avg.rating * 10) / 10 : 0,
      count: r._count._all,
    };
  }
  return NextResponse.json({
    ratings: rows.reduce<Record<string, number>>((acc, r) => {
      if (r.playerId) acc[r.playerId] = r.rating;
      return acc;
    }, {}),
    averages,
  });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'התחבר כדי לנקד שחקנים' }, { status: 401 });
  try {
    const body = await req.json();
    const ratings = Array.isArray(body.ratings) ? (body.ratings as RatingInput[]) : null;
    if (!ratings) return NextResponse.json({ error: 'Bad request' }, { status: 400 });

    const game = await prisma.game.findUnique({ where: { id: params.id }, select: { id: true, status: true } });
    if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 });

    let saved = 0;
    let cleared = 0;
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
      const value = Math.max(1, Math.min(10, Number(raw)));
      if (!Number.isFinite(value)) continue;
      const existing = await prisma.playerMatchRating.findFirst({
        where: { gameId: params.id, playerId, source: 'user', sourceUserId: user.id },
        select: { id: true },
      });
      if (existing) {
        await prisma.playerMatchRating.update({ where: { id: existing.id }, data: { rating: value } });
      } else {
        await prisma.playerMatchRating.create({
          data: { gameId: params.id, playerId, source: 'user', sourceUserId: user.id, rating: value },
        });
      }
      saved++;
    }
    return NextResponse.json({ saved, cleared });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 400 });
  }
}
