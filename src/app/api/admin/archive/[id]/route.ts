import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { parseArchiveReview, validateArchiveLinks } from '@/lib/fan-archive';
import { archiveApiError, archivePrivateHeaders, readArchiveJson } from '@/lib/fan-archive-api';

type Context = { params: Promise<{ id: string }> };
export async function PATCH(request: NextRequest, context: Context) {
  const viewer = await getRequestUser(request);
  if (!viewer || viewer.role !== 'ADMIN') return NextResponse.json({ error: 'אין הרשאת מנהל' }, { status: 403 });
  try {
    const { id } = await context.params;
    const input = parseArchiveReview(await readArchiveJson(request));
    const result = await prisma.$transaction(async (tx) => {
      const item = await tx.fanArchiveItem.findFirst({ where: { id } });
      if (!item) return 'missing';
      if (!input.expectedUpdatedAt || !item.updatedAt || new Date(input.expectedUpdatedAt).getTime() !== item.updatedAt.getTime()) return 'conflict';
      if (input.links) await validateArchiveLinks(tx, { ...item, ...input.links, status: 'PENDING' });
      // Explicit pending-to-published transition; a rejected entry must first be resubmitted by its owner.
      if (input.action === 'publish' && (item.status !== 'PENDING' || !item.permissionGranted)) return 'conflict';
      // Admins may remove a published item by returning it to its owner with an explanation.
      if (input.action === 'reject' && item.status !== 'PENDING' && item.status !== 'PUBLISHED') return 'conflict';
      const now = new Date();
      const updated = await tx.fanArchiveItem.updateMany({
        where: { id, status: item.status, updatedAt: item.updatedAt, ...(input.action === 'publish' ? { permissionGranted: true } : {}) },
        data: { ...input.links, status: input.action === 'publish' ? 'PUBLISHED' : 'REJECTED', reviewNoteHe: input.reviewNoteHe, reviewedById: viewer.id, reviewedAt: now, publishedAt: input.action === 'publish' ? now : null },
      });
      if (updated.count !== 1) return 'conflict';
      await tx.fanArchiveRevision.create({ data: { itemId: id, action: input.action === 'publish' ? 'PUBLISH' : 'REJECT', snapshot: JSON.parse(JSON.stringify({ ...item, changedBy: viewer.id })) } });
      return 'ok';
    });
    if (result === 'missing') return NextResponse.json({ error: 'הפריט לא נמצא' }, { status: 404 });
    if (result !== 'ok') return NextResponse.json({ error: 'הפריט אינו ממתין לאישור או השתנה. יש לרענן את העמוד' }, { status: 409 });
    return NextResponse.json({ ok: true }, { headers: archivePrivateHeaders });
  } catch (error) { return archiveApiError(error); }
}
