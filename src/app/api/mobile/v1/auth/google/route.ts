import { NextRequest, NextResponse } from 'next/server';
import { verifyGoogleIdToken, resolveSocialUser, SocialAuthError } from '@/lib/social-auth';
import { issueMobileSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let body: { idToken?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body.idToken || typeof body.idToken !== 'string') {
    return NextResponse.json({ error: 'idToken is required' }, { status: 400 });
  }
  try {
    const identity = await verifyGoogleIdToken(body.idToken);
    const user = await resolveSocialUser(identity);
    if (!user.isActive) {
      return NextResponse.json({ error: 'Account disabled' }, { status: 403 });
    }
    const payload = await issueMobileSession(user);
    return NextResponse.json(payload, { status: 200 });
  } catch (err) {
    if (err instanceof SocialAuthError) {
      return NextResponse.json({ error: 'Sign-in failed' }, { status: 401 });
    }
    throw err;
  }
}
