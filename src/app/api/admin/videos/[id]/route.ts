import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { attachVideo, detachVideo } from '@/lib/videos/service';

export const dynamic = 'force-dynamic';

// Decide on a found video: approve (link it to its game) or reject (and take it off the game page).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getRequestUser(request);
  if (!auth || auth.role !== 'ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const b = await request.json().catch(() => null);
  const c = await prisma.gameVideoCandidate.findUnique({ where: { id } });
  if (!c) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (b?.action === 'approve') {
    if (!c.gameId) return NextResponse.json({ error: 'אין משחק משויך' }, { status: 400 });
    const kind = b.kind === 'full' || b.kind === 'recap' ? b.kind : (c.kind as 'recap' | 'full');
    await attachVideo(c.gameId, c.videoId, kind);
    await prisma.gameVideoCandidate.update({ where: { id }, data: { status: 'APPROVED', kind } });
  } else if (b?.action === 'reject') {
    if (c.gameId) await detachVideo(c.gameId, c.videoId);
    await prisma.gameVideoCandidate.update({ where: { id }, data: { status: 'REJECTED' } });
  } else {
    return NextResponse.json({ error: 'Bad action' }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
