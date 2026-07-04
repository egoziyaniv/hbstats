import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth';
import prisma from '@/lib/prisma';

// Parse a client-supplied date. Returns { value: null } for empty input and
// { invalid: true } for an unparseable string, so a bad date becomes a 400
// instead of an Invalid Date that makes Prisma throw a 500.
function parseDate(v: unknown): { value: Date | null } | { invalid: true } {
  if (v === null || v === undefined || v === '') return { value: null };
  const d = new Date(v as string);
  return Number.isNaN(d.getTime()) ? { invalid: true } : { value: d };
}

async function readJson(request: NextRequest): Promise<any | null> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const auth = await getRequestUser(request);
  if (!auth || auth.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await readJson(request);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  const playerId = body?.playerId;
  const typeHe = body?.typeHe?.trim() || null;
  const typeEn = body?.typeEn?.trim() || typeHe || 'Injury';

  if (!playerId || !typeHe) {
    return NextResponse.json({ error: 'playerId and typeHe are required' }, { status: 400 });
  }

  const start = parseDate(body?.startDate);
  if ('invalid' in start) {
    return NextResponse.json({ error: 'Invalid startDate' }, { status: 400 });
  }
  const startDate = start.value ?? new Date();

  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { id: true, nameEn: true, nameHe: true, apiFootballId: true, team: { select: { seasonId: true } } },
  });

  if (!player) {
    return NextResponse.json({ error: 'Player not found' }, { status: 404 });
  }

  const entry = await prisma.playerSidelinedEntry.create({
    data: {
      playerNameEn: player.nameEn,
      playerNameHe: player.nameHe,
      apiFootballPlayerId: player.apiFootballId,
      typeEn,
      typeHe,
      startDate,
      endDate: null,
      seasonId: player.team.seasonId,
      playerId: player.id,
    },
  });

  return NextResponse.json(entry, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const auth = await getRequestUser(request);
  if (!auth || auth.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await readJson(request);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  const id = body?.id;
  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const data: any = {};
  if (body.typeHe !== undefined) data.typeHe = body.typeHe?.trim() || null;
  if (body.typeEn !== undefined) data.typeEn = body.typeEn?.trim() || null;
  for (const field of ['endDate', 'startDate'] as const) {
    if (body[field] !== undefined) {
      const parsed = parseDate(body[field]);
      if ('invalid' in parsed) {
        return NextResponse.json({ error: `Invalid ${field}` }, { status: 400 });
      }
      data[field] = parsed.value;
    }
  }

  try {
    const entry = await prisma.playerSidelinedEntry.update({ where: { id }, data });
    return NextResponse.json(entry);
  } catch (err) {
    if ((err as { code?: string })?.code === 'P2025') {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    }
    throw err;
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await getRequestUser(request);
  if (!auth || auth.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  try {
    await prisma.playerSidelinedEntry.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    if ((err as { code?: string })?.code === 'P2025') {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    }
    throw err;
  }
}
