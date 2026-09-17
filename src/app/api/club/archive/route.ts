import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { parseArchiveInput, publicArchiveSelect, validateArchiveLinks } from '@/lib/fan-archive';
import { archiveApiError, archivePrivateHeaders, readArchiveJson } from '@/lib/fan-archive-api';

export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  try {
    if (request.nextUrl.searchParams.get('mine') === '1') {
      const viewer = await getRequestUser(request);
      if (!viewer) return NextResponse.json({ error: 'יש להתחבר לחשבון' }, { status: 401 });
      const items = await prisma.fanArchiveItem.findMany({ where: { authorId: viewer.id }, orderBy: { createdAt: 'desc' }, take: 100 });
      return NextResponse.json({ items }, { headers: archivePrivateHeaders });
    }
    const items = await prisma.fanArchiveItem.findMany({ where: { status: 'PUBLISHED', permissionGranted: true }, select: publicArchiveSelect, orderBy: { publishedAt: 'desc' }, take: 100 });
    return NextResponse.json({ items });
  } catch (error) { return archiveApiError(error); }
}
export async function POST(request: NextRequest) {
  const viewer = await getRequestUser(request);
  if (!viewer) return NextResponse.json({ error: 'יש להתחבר לחשבון' }, { status: 401 });
  try {
    const input = parseArchiveInput(await readArchiveJson(request));
    const item = await prisma.$transaction(async (tx) => {
      await validateArchiveLinks(tx, input);
      return tx.fanArchiveItem.create({ data: { ...input, authorId: viewer.id } });
    });
    return NextResponse.json({ item }, { status: 201, headers: archivePrivateHeaders });
  } catch (error) { return archiveApiError(error); }
}
