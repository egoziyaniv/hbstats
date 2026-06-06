import { NextRequest, NextResponse } from 'next/server';
import { verifyAppleIdToken, resolveSocialUser, SocialAuthError } from '@/lib/social-auth';
import { createSession, toSafeUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let body: { idToken?: string; nonce?: string; name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body.idToken || typeof body.idToken !== 'string') {
    return NextResponse.json({ error: 'idToken is required' }, { status: 400 });
  }
  try {
    const identity = await verifyAppleIdToken(body.idToken, body.nonce, body.name);
    const user = await resolveSocialUser(identity);
    if (!user.isActive) {
      return NextResponse.json({ error: 'החשבון מושבת.' }, { status: 403 });
    }
    await createSession(user.id);
    return NextResponse.json({ user: toSafeUser(user) }, { status: 200 });
  } catch (err) {
    if (err instanceof SocialAuthError) {
      return NextResponse.json({ error: 'ההתחברות נכשלה.' }, { status: 401 });
    }
    throw err;
  }
}
