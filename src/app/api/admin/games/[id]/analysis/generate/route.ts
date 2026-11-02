import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getAdminAnalyses } from '@/lib/match-analysis/admin';
import { buildAnalyses, rewriteAnalysis } from '@/lib/match-analysis/job';

export const dynamic = 'force-dynamic';
export const maxDuration = 180;

/**
 * mode 'rebuild': recompute the facts and text of this finished game's POST and next-game PRE
 * (creates them if missing). mode 'rewrite' + id: new wording from the facts the editor kept.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: gameId } = await params;
  const auth = await getRequestUser(request);
  if (!auth || auth.role !== 'ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { mode?: 'rebuild' | 'rewrite'; id?: string };

  try {
    if (body.mode === 'rewrite') {
      const row = body.id ? await prisma.matchAnalysis.findFirst({ where: { id: body.id, OR: [{ sourceGameId: gameId }, { gameId }] }, select: { id: true } }) : null;
      if (!row) return NextResponse.json({ error: 'הניתוח לא נמצא' }, { status: 404 });
      const updated = await rewriteAnalysis(row.id);
      if (!updated) return NextResponse.json({ error: 'לא ניתן לכתוב מחדש כרגע (אין מפתח AI פעיל או אין עובדות).' }, { status: 502 });
    } else {
      await buildAnalyses(gameId, { force: true });
    }
  } catch (e) {
    console.error('[match-analysis] generate failed:', e);
    return NextResponse.json({ error: 'החישוב נכשל — המשחק אינו משחק רשמי שהסתיים של הקבוצה?' }, { status: 400 });
  }
  return NextResponse.json({ analyses: await getAdminAnalyses(gameId) });
}
