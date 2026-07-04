import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// Register (or refresh) a device's Expo push token. Auth is OPTIONAL — guest
// devices register with userId=null; once the user logs in the token re-binds
// to them on the next call.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const token: string | undefined = body?.token;
  const platform = body?.platform === 'android' ? 'android' : 'ios';

  if (!token || !(token.startsWith('ExpoPushToken[') || token.startsWith('ExponentPushToken['))) {
    return NextResponse.json({ error: 'invalid token' }, { status: 400 });
  }

  const user = await getRequestUser(request).catch(() => null);

  await prisma.pushToken.upsert({
    where: { token },
    update: {
      platform,
      enabled: true,
      // Only (re)bind to a user when authenticated. NEVER downgrade an existing
      // binding to null: unauthenticated cold-start re-registers must not unbind
      // a token that a logged-in launch already tied to its user.
      ...(user ? { userId: user.id } : {}),
    },
    create: { token, userId: user?.id ?? null, platform, enabled: true },
  });

  return NextResponse.json({ ok: true });
}
