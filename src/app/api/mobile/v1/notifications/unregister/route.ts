import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// Disable a device's push token (called on logout / opt-out). Idempotent.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const token: string | undefined = body?.token;
  if (!token) return NextResponse.json({ error: 'invalid token' }, { status: 400 });

  await prisma.pushToken.updateMany({ where: { token }, data: { enabled: false } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
