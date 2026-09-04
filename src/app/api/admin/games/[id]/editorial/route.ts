import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth';
import prisma from '@/lib/prisma';

async function readJson(req: NextRequest): Promise<any | null> {
  try { return await req.json(); } catch { return null; }
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getRequestUser(request);
  if (!auth || auth.role !== 'ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const [editorial, gallery] = await Promise.all([
    prisma.gameEditorial.findUnique({ where: { gameId: params.id } }),
    prisma.mediaAsset.findMany({
      where: { gameId: params.id },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, filePath: true, title: true },
    }),
  ]);
  return NextResponse.json({ editorial, gallery });
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getRequestUser(request);
  if (!auth || auth.role !== 'ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await readJson(request);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  const game = await prisma.game.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 });

  const data = {
    recapVideoUrl: body.recapVideoUrl?.trim() || null,
    fullMatchUrl: body.fullMatchUrl?.trim() || null,
    reportTitleHe: body.reportTitleHe?.trim() || null,
    reportHe: body.reportHe?.trim() || null,
    matchFactHe: body.matchFactHe?.trim() || null,
    aiGenerated: !!body.aiGenerated,
  };

  const editorial = await prisma.gameEditorial.upsert({
    where: { gameId: params.id },
    create: { gameId: params.id, ...data },
    update: data,
  });
  return NextResponse.json(editorial);
}
