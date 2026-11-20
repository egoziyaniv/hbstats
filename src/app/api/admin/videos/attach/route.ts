import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { attachVideo } from '@/lib/videos/service';

export const dynamic = 'force-dynamic';

// Admin links a video to a game (from the paste-a-link flow, or a game id typed by hand).
export async function POST(request: NextRequest) {
  const auth = await getRequestUser(request);
  if (!auth || auth.role !== 'ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const b = await request.json().catch(() => null);
  const videoId = typeof b?.videoId === 'string' && /^[A-Za-z0-9_-]{11}$/.test(b.videoId) ? b.videoId : null;
  const gameId = typeof b?.gameId === 'string' ? b.gameId.match(/(?:games\/)?([A-Za-z0-9_-]{10,40})\/?$/)?.[1] ?? null : null;
  const kind = b?.kind === 'full' ? 'full' : 'recap';
  if (!videoId || !gameId) return NextResponse.json({ error: 'חסר סרטון או משחק' }, { status: 400 });
  const game = await prisma.game.findUnique({ where: { id: gameId }, select: { id: true } });
  if (!game) return NextResponse.json({ error: 'המשחק לא נמצא' }, { status: 404 });

  await attachVideo(gameId, videoId, kind);
  const data = {
    title: String(b.title || videoId).slice(0, 500),
    channel: b.channel ? String(b.channel).slice(0, 200) : null,
    publishedAt: b.publishedAt ? new Date(b.publishedAt) : null,
    durationSec: Number.isFinite(b.durationSec) ? Math.round(b.durationSec) : null,
    kind, gameId, status: 'APPROVED', source: 'admin',
  };
  await prisma.gameVideoCandidate.upsert({ where: { videoId }, create: { videoId, ...data }, update: data });
  return NextResponse.json({ ok: true, gameId });
}
