/**
 * /api/admin/ratings/[gameId] — admin CRUD for per-source player ratings on a
 * single match. GET returns the lineup plus a matrix of source × player ratings
 * so the editor can show side-by-side values. POST/PUT writes an 'admin'
 * source rating (or any other source if explicitly passed).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import prisma from '@/lib/prisma';

const KNOWN_SOURCES = ['api-football', 'sofascore', 'fotmob', 'admin'] as const;

export async function GET(_req: NextRequest, { params }: { params: { gameId: string } }) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const game = await prisma.game.findUnique({
    where: { id: params.gameId },
    select: {
      id: true, dateTime: true, homeScore: true, awayScore: true,
      homeTeam: { select: { id: true, nameHe: true, nameEn: true, logoUrl: true } },
      awayTeam: { select: { id: true, nameHe: true, nameEn: true, logoUrl: true } },
      lineupEntries: {
        where: { role: { in: ['STARTER', 'SUBSTITUTE'] } },
        select: {
          playerId: true,
          teamId: true,
          jerseyNumber: true,
          role: true,
          player: { select: { id: true, nameHe: true, nameEn: true, position: true, photoUrl: true } },
        },
        orderBy: [{ role: 'asc' }, { jerseyNumber: 'asc' }],
      },
    },
  });
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 });

  // Fetch every rating row for this game so we can present a per-source matrix.
  const ratingRows = await prisma.playerMatchRating.findMany({
    where: { gameId: params.gameId },
    select: { id: true, playerId: true, source: true, sourceUserId: true, rating: true, notes: true },
  });
  const ratingsByPlayer = new Map<string, Record<string, { id: string; rating: number; notes: string | null }>>();
  for (const r of ratingRows) {
    if (!r.playerId) continue;
    let bucket = ratingsByPlayer.get(r.playerId);
    if (!bucket) { bucket = {}; ratingsByPlayer.set(r.playerId, bucket); }
    bucket[r.source] = { id: r.id, rating: r.rating, notes: r.notes };
  }

  const players = game.lineupEntries
    .filter((e): e is typeof e & { playerId: string; player: NonNullable<typeof e.player> } => !!e.playerId && !!e.player)
    .map((e) => ({
      playerId: e.playerId,
      jerseyNumber: e.jerseyNumber,
      role: e.role,
      teamId: e.teamId,
      teamSide: e.teamId === game.homeTeam.id ? 'home' as const : 'away' as const,
      displayName: e.player.nameHe || e.player.nameEn,
      position: e.player.position,
      photoUrl: e.player.photoUrl,
      ratings: ratingsByPlayer.get(e.playerId) || {},
    }));

  return NextResponse.json({
    game: {
      id: game.id,
      dateTime: game.dateTime,
      homeScore: game.homeScore,
      awayScore: game.awayScore,
      homeTeam: game.homeTeam,
      awayTeam: game.awayTeam,
    },
    sources: KNOWN_SOURCES,
    players,
  });
}

export async function PUT(req: NextRequest, { params }: { params: { gameId: string } }) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const body = await req.json();
    const playerId = String(body.playerId || '').trim();
    const source = String(body.source || 'admin').trim();
    const rawRating = body.rating;
    const notes = typeof body.notes === 'string' ? body.notes.trim() : null;
    if (!playerId) return NextResponse.json({ error: 'Missing playerId' }, { status: 400 });

    // null / empty rating => delete the row (admin clears their rating)
    if (rawRating === null || rawRating === '' || rawRating === undefined) {
      const existing = await prisma.playerMatchRating.findFirst({
        where: { gameId: params.gameId, playerId, source },
        select: { id: true },
      });
      if (existing) await prisma.playerMatchRating.delete({ where: { id: existing.id } });
      return NextResponse.json({ ok: true, deleted: !!existing });
    }

    const rating = Math.max(0, Math.min(10, Number(rawRating)));
    if (!Number.isFinite(rating)) return NextResponse.json({ error: 'Invalid rating' }, { status: 400 });

    const existing = await prisma.playerMatchRating.findFirst({
      where: { gameId: params.gameId, playerId, source },
      select: { id: true },
    });
    if (existing) {
      const updated = await prisma.playerMatchRating.update({
        where: { id: existing.id },
        data: { rating, notes },
      });
      return NextResponse.json(updated);
    }
    const created = await prisma.playerMatchRating.create({
      data: { gameId: params.gameId, playerId, source, rating, notes },
    });
    return NextResponse.json(created);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 400 });
  }
}
