import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyPassword, issueMobileSession } from '@/lib/auth';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import type { LoginRequest } from '@shared/types/mobile-api';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let body: Partial<LoginRequest>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Per-IP rate limit: any request (valid or not) counts toward IP limit
  const ip = getClientIp(request);
  if (!checkRateLimit(`login:ip:${ip}`, 5, 60_000)) {
    return NextResponse.json({ error: 'Too many login attempts. Try again in a minute.' }, { status: 429 });
  }

  if (
    !body.email ||
    !body.password ||
    typeof body.email !== 'string' ||
    typeof body.password !== 'string'
  ) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
  }

  // Per-email rate limit: only counts valid-shape requests
  if (!checkRateLimit(`login:email:${body.email.toLowerCase()}`, 10, 60 * 60_000)) {
    return NextResponse.json({ error: 'Too many login attempts for this account.' }, { status: 429 });
  }

  const user = await prisma.user.findUnique({
    where: { email: body.email.toLowerCase() },
  });
  if (!user || !user.isActive) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  const passwordValid = user.password ? await verifyPassword(body.password, user.password) : false;
  if (!passwordValid) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  const payload = await issueMobileSession(user);
  return NextResponse.json(payload, { status: 200 });
}
