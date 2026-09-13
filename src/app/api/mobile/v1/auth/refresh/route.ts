import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { signAccessToken } from '@/lib/jwt';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import type { RefreshRequest, RefreshResponse } from '@shared/types/mobile-api';

const REFRESH_TTL_DAYS = 60;
const RETRY_WINDOW_MS = 30_000;

function sha256(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

// Reconstruct the same successor during the bounded retry window, even across
// workers/restarts. The DB keeps only the hash. Neither the DB nor an old token
// alone reveals the successor: derivation also requires the server secret.
function replacementToken(original: string, replacementId: string) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not set');
  return crypto.createHmac('sha256', secret)
    .update(JSON.stringify(['statsai-refresh-v1', original, replacementId])).digest('hex');
}

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let body: Partial<RefreshRequest> | null;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const refreshToken = body?.refreshToken;
  if (!refreshToken || typeof refreshToken !== 'string') {
    return NextResponse.json({ error: 'refreshToken is required' }, { status: 400 });
  }
  const ip = getClientIp(request);
  if (!checkRateLimit(`refresh:ip:${ip}`, 10, 60_000)) {
    return NextResponse.json({ error: 'Too many refresh attempts.' }, { status: 429 });
  }

  // A serialization loser rereads the committed successor on retry, never
  // commits a second branch. Bounded retries also cover revocation racing rotation.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const payload = await prisma.$transaction(async (tx): Promise<RefreshResponse | null> => {
        const now = new Date();
        const session = await tx.session.findUnique({
          where: { tokenHash: sha256(refreshToken) }, include: { user: true },
        });
        if (!session || session.expiresAt <= now || !session.user.isActive) return null;
        // Share this lock with logout/password recovery so revocation cannot
        // miss a newly committed successor. Serializable retry rereads state.
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${session.userId} FOR UPDATE`;

        if (session.replacedAt) {
          if (now.getTime() - session.replacedAt.getTime() <= RETRY_WINDOW_MS && session.replacedBy) {
            const successor = await tx.session.findUnique({ where: { id: session.replacedBy } });
            // Always consult DB: a cached response must never revive a revoked
            // session or return an already-rotated successor to a late retry.
            if (!successor || successor.userId !== session.userId || successor.familyId !== session.familyId || successor.replacedAt || successor.expiresAt <= now) return null;
            const raw = replacementToken(refreshToken, successor.id);
            // Legacy rotations used random tokens; fail closed if not reconstructible.
            if (sha256(raw) !== successor.tokenHash) return null;
            return { accessToken: signAccessToken(session.userId, successor.id, successor.createdAt), refreshToken: raw };
          }
          await tx.session.deleteMany({ where: { familyId: session.familyId } });
          return null;
        }

        const id = crypto.randomUUID();
        const raw = replacementToken(refreshToken, id);
        const successor = await tx.session.create({ data: {
          id, userId: session.userId, tokenHash: sha256(raw), familyId: session.familyId,
          expiresAt: new Date(now.getTime() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000),
        } });
        await tx.session.update({ where: { id: session.id }, data: { replacedAt: now, replacedBy: successor.id } });
        return { accessToken: signAccessToken(session.userId, successor.id, successor.createdAt), refreshToken: raw };
      }, { isolationLevel: 'Serializable' });
      return payload
        ? NextResponse.json(payload, { status: 200 })
        : NextResponse.json({ error: 'Invalid refresh token' }, { status: 401 });
    } catch (error) {
      if ((error as { code?: string })?.code !== 'P2034') throw error;
      if (attempt === 2) return NextResponse.json({ error: 'Please retry refresh.' }, { status: 503 });
    }
  }
  return NextResponse.json({ error: 'Please retry refresh.' }, { status: 503 });
}
