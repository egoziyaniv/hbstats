import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { slugifySong } from '@/lib/song-display';
import { ClubPageCategory } from '@prisma/client';

const CATEGORIES = Object.values(ClubPageCategory) as string[];
async function readJson(req: NextRequest): Promise<any | null> {
  try { return await req.json(); } catch { return null; }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getRequestUser(request);
  if (!auth || auth.role !== 'ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await readJson(request);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  const existing = await prisma.clubPage.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const title = String(body.title ?? existing.title).trim();
  let slug = existing.slug;
  const desired = body.slug ? slugifySong(String(body.slug)) : slugifySong(title);
  if (desired && desired !== existing.slug) {
    const taken = await prisma.clubPage.findUnique({ where: { slug: desired }, select: { id: true } });
    if (!taken) slug = desired;
  }

  const page = await prisma.clubPage.update({
    where: { id: params.id },
    data: {
      slug,
      title,
      category: (CATEGORIES.includes(body.category) ? body.category : existing.category) as ClubPageCategory,
      bodyHe: String(body.bodyHe ?? existing.bodyHe).trim(),
      heroImageUrl: body.heroImageUrl?.trim() || null,
      displayOrder: Number.isFinite(+body.displayOrder) ? +body.displayOrder : existing.displayOrder,
      isPublished: body.isPublished !== false,
    },
  });
  return NextResponse.json(page);
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getRequestUser(request);
  if (!auth || auth.role !== 'ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await prisma.clubPage.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
