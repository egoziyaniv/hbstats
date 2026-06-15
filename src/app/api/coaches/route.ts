/**
 * /api/coaches — admin CRUD + merge for the Coach model.
 *
 * Mirrors the referees admin API: GET lists all coaches with usage counts,
 * PUT updates Hebrew/English names + photo, POST merges two coaches (target
 * absorbs source, aliases and assignments move over), DELETE removes a coach
 * that has no aliases referencing it.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import prisma from '@/lib/prisma';

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

// GET /api/coaches — list with usage counts
export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const coaches = await prisma.coach.findMany({
    include: {
      aliases: { select: { alias: true } },
      _count: { select: { assignments: true } },
    },
    orderBy: { nameEn: 'asc' },
  });

  // Also pull GameLineupEntry COACH counts grouped by participantName so the
  // admin sees how many matches each alias is attributable to.
  const lineupCounts = await prisma.gameLineupEntry.groupBy({
    by: ['participantName'],
    where: { role: 'COACH', participantName: { not: null } },
    _count: { _all: true },
  });
  const matchesByAlias = new Map<string, number>();
  for (const row of lineupCounts) {
    if (row.participantName) matchesByAlias.set(row.participantName, row._count._all);
  }

  const enriched = coaches.map((c) => {
    const matches = c.aliases.reduce((sum, a) => sum + (matchesByAlias.get(a.alias) || 0), 0);
    return { ...c, matchCount: matches };
  });

  return NextResponse.json(enriched);
}

// PUT /api/coaches — update nameHe / nameEn / photoUrl
export async function PUT(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const body = await req.json();
    const id = normalizeString(body.id);
    const nameHe = normalizeString(body.nameHe);
    const nameEn = normalizeString(body.nameEn);
    const photoUrl = normalizeString(body.photoUrl);
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const existing = await prisma.coach.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Coach not found' }, { status: 404 });

    const updated = await prisma.coach.update({
      where: { id },
      data: {
        ...(nameHe ? { nameHe } : {}),
        ...(nameEn ? { nameEn } : {}),
        ...(photoUrl ? { photoUrl } : {}),
      },
    });

    // Mirror nameHe to denormalized TeamCoachAssignment.coachNameHe so legacy
    // callers that still read directly from assignments stay in sync.
    if (nameHe) {
      await prisma.teamCoachAssignment.updateMany({ where: { coachId: id }, data: { coachNameHe: nameHe } });
    }

    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to update' }, { status: 400 });
  }
}

// POST /api/coaches — merge two coaches (target absorbs source).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const body = await req.json();
    const action = normalizeString(body.action);
    if (action !== 'merge') return NextResponse.json({ error: 'Unknown action' }, { status: 400 });

    const targetId = normalizeString(body.targetId);
    const sourceId = normalizeString(body.sourceId);
    if (!targetId || !sourceId) return NextResponse.json({ error: 'Missing targetId or sourceId' }, { status: 400 });
    if (targetId === sourceId) return NextResponse.json({ error: 'Cannot merge with itself' }, { status: 400 });

    const [target, source] = await Promise.all([
      prisma.coach.findUnique({ where: { id: targetId } }),
      prisma.coach.findUnique({ where: { id: sourceId } }),
    ]);
    if (!target) return NextResponse.json({ error: 'Target coach not found' }, { status: 404 });
    if (!source) return NextResponse.json({ error: 'Source coach not found' }, { status: 404 });

    // Move aliases, assignments, and any source photo/apiFootballId that target lacks.
    await prisma.$transaction([
      prisma.coachAlias.updateMany({ where: { coachId: sourceId }, data: { coachId: targetId } }),
      prisma.teamCoachAssignment.updateMany({ where: { coachId: sourceId }, data: { coachId: targetId } }),
      prisma.coach.update({
        where: { id: targetId },
        data: {
          ...(target.nameHe ? {} : source.nameHe ? { nameHe: source.nameHe } : {}),
          ...(target.photoUrl ? {} : source.photoUrl ? { photoUrl: source.photoUrl } : {}),
          ...(target.apiFootballCoachId ? {} : source.apiFootballCoachId ? { apiFootballCoachId: source.apiFootballCoachId } : {}),
        },
      }),
      prisma.coach.delete({ where: { id: sourceId } }),
    ]);

    return NextResponse.json({
      message: `Merged "${source.nameEn}" into "${target.nameEn}".`,
      target,
      deletedSource: source.nameEn,
    });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed' }, { status: 400 });
  }
}

// DELETE /api/coaches?id=... — delete (only when no aliases/assignments reference it)
export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id') || '';
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const coach = await prisma.coach.findUnique({
      where: { id },
      include: { _count: { select: { aliases: true, assignments: true } } },
    });
    if (!coach) return NextResponse.json({ error: 'Coach not found' }, { status: 404 });
    if (coach._count.aliases > 0 || coach._count.assignments > 0) {
      return NextResponse.json({
        error: `Cannot delete — coach has ${coach._count.aliases} aliases and ${coach._count.assignments} assignments`,
      }, { status: 400 });
    }

    await prisma.coach.delete({ where: { id } });
    return NextResponse.json({ message: 'Deleted' });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to delete' }, { status: 400 });
  }
}
