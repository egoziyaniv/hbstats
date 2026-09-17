import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { archiveReadWhere, parseArchiveInput, publicArchiveSelect, validateArchiveLinks } from '@/lib/fan-archive';
import { archiveApiError, archivePrivateHeaders, readArchiveJson } from '@/lib/fan-archive-api';

type Context = { params: Promise<{ id: string }> };
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest, context: Context) {
  try {
    const viewer = await getRequestUser(request);
    const { id } = await context.params;
    const item = await prisma.fanArchiveItem.findFirst({ where: archiveReadWhere(id, viewer) });
    if (!item) return NextResponse.json({ error: 'הפריט לא נמצא' }, { status: 404 });
    const canReadPrivate = viewer && (viewer.id === item.authorId || viewer.role === 'ADMIN');
    const visible = canReadPrivate ? item : Object.fromEntries(Object.keys(publicArchiveSelect).map((key) => [key, item[key as keyof typeof item]]));
    return NextResponse.json({ item: visible }, { headers: archivePrivateHeaders });
  } catch (error) { return archiveApiError(error); }
}
export async function PUT(request: NextRequest, context: Context) {
  const viewer = await getRequestUser(request);
  if (!viewer) return NextResponse.json({ error: 'יש להתחבר לחשבון' }, { status: 401 });
  try {
    const { id } = await context.params;
    const body = await readArchiveJson(request);
    const input = parseArchiveInput(body);
    const expectedUpdatedAt = (body as { expectedUpdatedAt?: string }).expectedUpdatedAt;
    const result = await prisma.$transaction(async (tx) => {
      const item = await tx.fanArchiveItem.findFirst({ where: { id, authorId: viewer.id } });
      if (!item) return 'missing';
      if (!expectedUpdatedAt || !item.updatedAt || new Date(expectedUpdatedAt).getTime() !== item.updatedAt.getTime()) return 'conflict';
      if (item.status === 'PUBLISHED') return 'published';
      await validateArchiveLinks(tx, input);
      const updated = await tx.fanArchiveItem.updateMany({
        where: { id, authorId: viewer.id, status: { not: 'PUBLISHED' }, updatedAt: item.updatedAt },
        data: { ...input, reviewNoteHe: null, reviewedById: null, reviewedAt: null, publishedAt: null },
      });
      if (updated.count !== 1) return 'conflict';
      await tx.fanArchiveRevision.create({ data: { itemId: id, action: 'OWNER_EDIT', snapshot: JSON.parse(JSON.stringify(item)) } });
      return 'ok';
    });
    if (result === 'missing') return NextResponse.json({ error: 'הפריט לא נמצא' }, { status: 404 });
    if (result !== 'ok') return NextResponse.json({ error: 'הפריט כבר פורסם או השתנה. יש לרענן את העמוד' }, { status: 409 });
    const fresh = await prisma.fanArchiveItem.findFirst({ where: { id, authorId: viewer.id }, select: { updatedAt: true } });
    return NextResponse.json({ ok: true, updatedAt: fresh?.updatedAt?.toISOString() }, { headers: archivePrivateHeaders });
  } catch (error) { return archiveApiError(error); }
}
