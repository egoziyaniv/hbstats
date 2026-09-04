import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { slugifySong } from '@/lib/song-display';
import { ClubPageCategory } from '@prisma/client';

const CATEGORIES = Object.values(ClubPageCategory) as string[];
async function readJson(req: NextRequest): Promise<any | null> {
  try { return await req.json(); } catch { return null; }
}
async function uniqueSlug(base: string): Promise<string> {
  const root = base || 'page';
  let slug = root;
  let n = 2;
  // eslint-disable-next-line no-await-in-loop
  while (await prisma.clubPage.findUnique({ where: { slug }, select: { id: true } })) slug = `${root}-${n++}`;
  return slug;
}

export async function GET(request: NextRequest) {
  const auth = await getRequestUser(request);
  if (!auth || auth.role !== 'ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const pages = await prisma.clubPage.findMany({
    orderBy: [{ displayOrder: 'asc' }, { createdAt: 'desc' }],
  });
  return NextResponse.json({ pages });
}

export async function POST(request: NextRequest) {
  const auth = await getRequestUser(request);
  if (!auth || auth.role !== 'ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await readJson(request);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  const title = String(body.title ?? '').trim();
  if (!title) return NextResponse.json({ error: 'title is required' }, { status: 400 });
  const category = (CATEGORIES.includes(body.category) ? body.category : ClubPageCategory.HISTORY) as ClubPageCategory;
  const slug = await uniqueSlug(body.slug ? slugifySong(String(body.slug)) : slugifySong(title));

  const page = await prisma.clubPage.create({
    data: {
      slug,
      title,
      category,
      bodyHe: String(body.bodyHe ?? '').trim(),
      heroImageUrl: body.heroImageUrl?.trim() || null,
      displayOrder: Number.isFinite(+body.displayOrder) ? +body.displayOrder : 0,
      isPublished: body.isPublished !== false,
    },
  });
  return NextResponse.json(page, { status: 201 });
}
