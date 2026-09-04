import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { HallOfFameRole } from '@prisma/client';

const ROLES = Object.values(HallOfFameRole) as string[];
async function readJson(req: NextRequest): Promise<any | null> {
  try { return await req.json(); } catch { return null; }
}

export async function GET(request: NextRequest) {
  const auth = await getRequestUser(request);
  if (!auth || auth.role !== 'ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const entries = await prisma.hallOfFameEntry.findMany({
    orderBy: [{ rank: 'asc' }, { createdAt: 'desc' }],
    include: { player: { select: { id: true, nameHe: true } } },
  });
  return NextResponse.json({ entries });
}

export async function POST(request: NextRequest) {
  const auth = await getRequestUser(request);
  if (!auth || auth.role !== 'ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await readJson(request);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  const nameHe = String(body.nameHe ?? '').trim();
  if (!nameHe) return NextResponse.json({ error: 'nameHe is required' }, { status: 400 });
  const role = (ROLES.includes(body.role) ? body.role : HallOfFameRole.PLAYER) as HallOfFameRole;

  const entry = await prisma.hallOfFameEntry.create({
    data: {
      playerId: body.playerId || null,
      nameHe,
      role,
      years: body.years?.trim() || null,
      blurbHe: body.blurbHe?.trim() || null,
      statLineHe: body.statLineHe?.trim() || null,
      photoUrl: body.photoUrl?.trim() || null,
      rank: Number.isFinite(+body.rank) ? +body.rank : 0,
      isPublished: body.isPublished !== false,
    },
  });
  return NextResponse.json(entry, { status: 201 });
}
