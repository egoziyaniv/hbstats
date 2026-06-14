import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import prisma from '@/lib/prisma';
import { sendEmail } from '@/lib/email';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const TOKEN_TTL_MINUTES = 60;

function sha256(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function appOrigin(request: NextRequest): string {
  // Prefer explicit config, then nginx's forwarded headers (the request reaches
  // Next as localhost:3100, so nextUrl.origin would build a useless link).
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, '');
  if (configured) return configured;
  const host = request.headers.get('host');
  const proto = request.headers.get('x-forwarded-proto') || 'https';
  if (host) return `${proto}://${host}`;
  return request.nextUrl.origin;
}

export async function POST(request: NextRequest) {
  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const ip = getClientIp(request);
  if (!checkRateLimit(`reset-req:ip:${ip}`, 5, 60_000)) {
    return NextResponse.json({ error: 'יותר מדי בקשות. נסה שוב בעוד דקה.' }, { status: 429 });
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  // Always return the same response regardless of whether the account exists,
  // so this endpoint can't be used to enumerate registered emails.
  const genericOk = NextResponse.json({
    ok: true,
    message: 'אם קיים חשבון עם כתובת זו, נשלח אליה קישור לאיפוס סיסמה.',
  });

  if (!email || !email.includes('@')) return genericOk;

  const user = await prisma.user.findUnique({ where: { email } });
  // Only issue tokens for active, password-capable accounts. (Social-only
  // accounts with no password still get the generic response.)
  if (!user || !user.isActive) return genericOk;

  // Per-account throttle on top of the per-IP one.
  if (!checkRateLimit(`reset-req:email:${email}`, 3, 15 * 60_000)) return genericOk;

  const rawToken = crypto.randomBytes(32).toString('hex');
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: sha256(rawToken),
      expiresAt: new Date(Date.now() + TOKEN_TTL_MINUTES * 60_000),
    },
  });

  const link = `${appOrigin(request)}/reset-password?token=${rawToken}`;
  await sendEmail({
    to: email,
    subject: 'איפוס סיסמה — StatsAI',
    text:
      `קיבלנו בקשה לאיפוס הסיסמה שלך ב-StatsAI.\n\n` +
      `לחץ על הקישור הבא כדי להגדיר סיסמה חדשה (תקף ל-${TOKEN_TTL_MINUTES} דקות):\n${link}\n\n` +
      `אם לא ביקשת לאפס סיסמה, אפשר להתעלם מהודעה זו.`,
    html:
      `<div dir="rtl" style="font-family:Arial,sans-serif">` +
      `<p>קיבלנו בקשה לאיפוס הסיסמה שלך ב-<b>StatsAI</b>.</p>` +
      `<p><a href="${link}">להגדרת סיסמה חדשה</a> (תקף ל-${TOKEN_TTL_MINUTES} דקות).</p>` +
      `<p style="color:#888">אם לא ביקשת לאפס סיסמה, אפשר להתעלם מהודעה זו.</p></div>`,
  });

  return genericOk;
}
