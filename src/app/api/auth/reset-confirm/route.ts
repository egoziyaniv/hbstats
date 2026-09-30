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

class InvalidResetTokenError extends Error {}

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

  const tokenHash = sha256(token);
  const newHash = await hashPassword(password);

  let resetUserId: string | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const reset = await prisma.$transaction(async (tx) => {
        const now = new Date();
        const record = await tx.passwordResetToken.findUnique({ where: { tokenHash } });
        if (!record || record.usedAt || record.expiresAt <= now) {
          throw new InvalidResetTokenError();
        }

        // Serialize password-changing operations for this account. A retry
        // rereads the token after the winning transaction commits.
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${record.userId} FOR UPDATE`;
        const claim = await tx.passwordResetToken.updateMany({
          where: { id: record.id, usedAt: null, expiresAt: { gt: now } },
          data: { usedAt: now },
        });
        if (claim.count !== 1) throw new InvalidResetTokenError();

        await tx.user.update({
          where: { id: record.userId },
          data: { password: newHash, passwordChangedAt: now },
        });
        await tx.session.deleteMany({ where: { userId: record.userId } });
        await tx.passwordResetToken.deleteMany({
          where: { userId: record.userId, usedAt: null, id: { not: record.id } },
        });
        return { userId: record.userId };
      }, { isolationLevel: 'Serializable' });
      resetUserId = reset.userId;
      break;
    } catch (error) {
      if (error instanceof InvalidResetTokenError) {
        return NextResponse.json(
          { error: 'הקישור פג תוקף או כבר נוצל. בקש קישור חדש.' },
          { status: 400 }
        );
      }
      if ((error as { code?: string })?.code !== 'P2034') throw error;
    }
  }

  if (!resetUserId) {
    return NextResponse.json(
      { error: 'לא ניתן להשלים את האיפוס כרגע. נסה שוב בעוד רגע.' },
      { status: 503 }
    );
  }

  await logActivity({
    entityType: 'USER',
    entityId: resetUserId,
    actionHe: 'המשתמש איפס סיסמה דרך קישור במייל',
    userId: resetUserId,
  }).catch(() => null);

  return NextResponse.json({ ok: true, message: 'הסיסמה עודכנה. אפשר להתחבר עכשיו.' });
}
