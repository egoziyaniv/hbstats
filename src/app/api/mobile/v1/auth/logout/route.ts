import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getRequestUser } from '@/lib/auth';

function sha256(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let refreshToken: string | undefined;
  try {
    const body = await request.json().catch(() => null);
    if (body && typeof body.refreshToken === 'string') {
      refreshToken = body.refreshToken;
    }
  } catch {
    // body is optional
  }

  if (refreshToken) {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`;
      const session = await tx.session.findUnique({ where: { tokenHash: sha256(refreshToken!) } });
      if (session?.userId === user.id) {
        // Delete rotated ancestors too: their access JWTs remain valid during
        // normal rotation but must stop authorizing after this device logs out.
        await tx.session.deleteMany({ where: { familyId: session.familyId, userId: user.id } });
      }
    });
  }
  // If no refreshToken provided, this is a no-op success — client should clear local state anyway.

  return new NextResponse(null, { status: 204 });
}
