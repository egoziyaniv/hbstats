import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { HonorPlace } from '@prisma/client';

const PLACES = Object.values(HonorPlace) as string[];
async function readJson(req: NextRequest): Promise<any | null> {
  try { return await req.json(); } catch { return null; }
}
function deriveYear(rawYear: unknown, seasonLabel: string, fallback: number): number {
  if (rawYear != null && String(rawYear).trim() !== '' && Number.isFinite(+rawYear)) return Math.trunc(+rawYear);
  const parsed = parseInt(String(seasonLabel), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getRequestUser(request);
  if (!auth || auth.role !== 'ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await readJson(request);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  const existing = await prisma.clubHonor.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const competitionHe = String(body.competitionHe ?? existing.competitionHe).trim();
  const seasonLabel = String(body.seasonLabel ?? existing.seasonLabel).trim();

  const honor = await prisma.clubHonor.update({
    where: { id: params.id },
    data: {
      competitionHe,
      place: (PLACES.includes(body.place) ? body.place : existing.place) as HonorPlace,
      seasonLabel,
      year: deriveYear(body.year, seasonLabel, existing.year),
      displayOrder: Number.isFinite(+body.displayOrder) ? +body.displayOrder : existing.displayOrder,
    },
  });
  return NextResponse.json(honor);
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getRequestUser(request);
  if (!auth || auth.role !== 'ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await prisma.clubHonor.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
