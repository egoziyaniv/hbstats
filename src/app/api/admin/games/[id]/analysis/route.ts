import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { getRequestUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getAdminAnalyses } from '@/lib/match-analysis/admin';
import type { Fact } from '@/lib/match-analysis/types';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const auth = await getRequestUser(request);
  if (!auth || auth.role !== 'ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ analyses: await getAdminAnalyses(id) });
}

/** Save the editor's text / fact choices, and publish or unpublish. */
export async function PUT(request: NextRequest, { params }: Params) {
  const { id: gameId } = await params;
  const auth = await getRequestUser(request);
  if (!auth || auth.role !== 'ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => null) as {
    id?: string; titleHe?: string; bodyHe?: string; removedKeys?: string[]; status?: 'DRAFT' | 'PUBLISHED';
  } | null;
  if (!body?.id) return NextResponse.json({ error: 'חסר מזהה ניתוח' }, { status: 400 });

  const row = await prisma.matchAnalysis.findFirst({ where: { id: body.id, OR: [{ sourceGameId: gameId }, { gameId }] } });
  if (!row) return NextResponse.json({ error: 'הניתוח לא נמצא' }, { status: 404 });

  const data: Prisma.MatchAnalysisUpdateInput = {};
  if (typeof body.titleHe === 'string') data.titleHe = body.titleHe.trim() || null;
  if (typeof body.bodyHe === 'string') data.bodyHe = body.bodyHe.trim() || null;
  if (Array.isArray(body.removedKeys)) {
    const removed = new Set(body.removedKeys);
    const facts = ((row.facts as unknown as Fact[]) || []).map((f, i) => ({ ...f, removed: removed.has(`${i}`) }));
    data.facts = facts as unknown as Prisma.InputJsonValue;
  }
  if (body.status === 'PUBLISHED') {
    const text = typeof body.bodyHe === 'string' ? body.bodyHe.trim() : row.bodyHe;
    if (!text) return NextResponse.json({ error: 'אין טקסט לפרסום' }, { status: 400 });
    data.status = 'PUBLISHED';
    data.publishedAt = row.publishedAt ?? new Date();
  } else if (body.status === 'DRAFT') {
    data.status = 'DRAFT';
    data.publishedAt = null;
  }
  await prisma.matchAnalysis.update({ where: { id: row.id }, data });
  return NextResponse.json({ analyses: await getAdminAnalyses(gameId) });
}
