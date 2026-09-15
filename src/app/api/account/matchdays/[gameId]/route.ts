import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ gameId: string }> };

export async function PUT(request: NextRequest, { params }: Context) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (typeof body?.attended !== 'boolean') {
    return NextResponse.json({ error: 'attended חייב להיות ערך בוליאני' }, { status: 400 });
  }

  const { gameId } = await params;
  const game = await prisma.game.findUnique({ where: { id: gameId }, select: { id: true } });
  if (!game) return NextResponse.json({ error: 'המשחק לא נמצא' }, { status: 404 });

  if (body.attended) {
    await prisma.userMatchAttendance.upsert({
      where: { userId_gameId: { userId: user.id, gameId } },
      create: { userId: user.id, gameId },
      update: {},
    });
  } else {
    await prisma.userMatchAttendance.deleteMany({ where: { userId: user.id, gameId } });
  }

  return NextResponse.json({ attended: body.attended });
}
