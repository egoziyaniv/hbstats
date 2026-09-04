import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { HonorPlace } from '@prisma/client';

const PLACES = Object.values(HonorPlace) as string[];
async function readJson(req: NextRequest): Promise<any | null> {
  try { return await req.json(); } catch { return null; }
}
function deriveYear(rawYear: unknown, seasonLabel: string): number {
  if (rawYear != null && String(rawYear).trim() !== '' && Number.isFinite(+rawYear)) return Math.trunc(+rawYear);
  const parsed = parseInt(String(seasonLabel), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function GET(request: NextRequest) {
  const auth = await getRequestUser(request);
  if (!auth || auth.role !== 'ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const honors = await prisma.clubHonor.findMany({
    orderBy: [{ year: 'desc' }, { displayOrder: 'asc' }],
  });
  return NextResponse.json({ honors });
}

export async function POST(request: NextRequest) {
  const auth = await getRequestUser(request);
  if (!auth || auth.role !== 'ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await readJson(request);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  const competitionHe = String(body.competitionHe ?? '').trim();
  if (!competitionHe) return NextResponse.json({ error: 'competitionHe is required' }, { status: 400 });
  const seasonLabel = String(body.seasonLabel ?? '').trim();
  if (!seasonLabel) return NextResponse.json({ error: 'seasonLabel is required' }, { status: 400 });
  if (!PLACES.includes(body.place)) return NextResponse.json({ error: 'place is required' }, { status: 400 });
  const place = body.place as HonorPlace;

  const honor = await prisma.clubHonor.create({
    data: {
      competitionHe,
      place,
      seasonLabel,
      year: deriveYear(body.year, seasonLabel),
      displayOrder: Number.isFinite(+body.displayOrder) ? +body.displayOrder : 0,
    },
  });
  return NextResponse.json(honor, { status: 201 });
}
