import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { HallOfFameRole } from '@prisma/client';

const ROLES = Object.values(HallOfFameRole) as string[];
async function readJson(req: NextRequest): Promise<any | null> {
  try { return await req.json(); } catch { return null; }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getRequestUser(request);
  if (!auth || auth.role !== 'ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await readJson(request);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  const existing = await prisma.hallOfFameEntry.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const nameHe = String(body.nameHe ?? existing.nameHe).trim();

  const entry = await prisma.hallOfFameEntry.update({
    where: { id: params.id },
    data: {
      playerId: body.playerId || null,
      nameHe,
      role: (ROLES.includes(body.role) ? body.role : existing.role) as HallOfFameRole,
      years: body.years?.trim() || null,
      blurbHe: body.blurbHe?.trim() || null,
      statLineHe: body.statLineHe?.trim() || null,
      photoUrl: body.photoUrl?.trim() || null,
      rank: Number.isFinite(+body.rank) ? +body.rank : existing.rank,
      isPublished: body.isPublished !== false,
    },
  });
  return NextResponse.json(entry);
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getRequestUser(request);
  if (!auth || auth.role !== 'ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await prisma.hallOfFameEntry.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
