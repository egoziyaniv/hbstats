import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import prisma from '@/lib/prisma';
import { hashPassword } from '@/lib/auth';
import { logActivity } from '@/lib/activity';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

function sha256(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export async function POST(request: NextRequest) {
  let body: { token?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const ip = getClientIp(request);
  if (!checkRateLimit(`reset-confirm:ip:${ip}`, 10, 60_000)) {
    return NextResponse.json({ error: 'יותר מדי בקשות. נסה שוב בעוד דקה.' }, { status: 429 });
  }

  const token = typeof body.token === 'string' ? body.token : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!token) {
    return NextResponse.json({ error: 'קישור איפוס לא תקין.' }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'הסיסמה חייבת להיות באורך 8 תווים לפחות.' }, { status: 400 });
  }

  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: sha256(token) },
  });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return NextResponse.json(
      { error: 'הקישור פג תוקף או כבר נוצל. בקש קישור חדש.' },
      { status: 400 }
    );
  }

  const newHash = await hashPassword(password);

  // Atomically: set the new password, stamp passwordChangedAt, mark the token
  // used, invalidate ALL existing sessions, and burn any other outstanding
  // reset tokens for this user.
  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { password: newHash, passwordChangedAt: new Date() },
    }),
    prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
    prisma.passwordResetToken.deleteMany({
      where: { userId: record.userId, usedAt: null },
    }),
    prisma.session.deleteMany({ where: { userId: record.userId } }),
  ]);

  await logActivity({
    entityType: 'USER',
    entityId: record.userId,
    actionHe: 'המשתמש איפס סיסמה דרך קישור במייל',
    userId: record.userId,
  }).catch(() => null);

  return NextResponse.json({ ok: true, message: 'הסיסמה עודכנה. אפשר להתחבר עכשיו.' });
}
