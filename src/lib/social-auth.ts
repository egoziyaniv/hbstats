import { OAuth2Client } from 'google-auth-library';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { User } from '@prisma/client';
import prisma from '@/lib/prisma';

export type SocialProvider = 'google' | 'apple';

export interface SocialIdentity {
  provider: SocialProvider;
  sub: string;
  email?: string;
  emailVerified: boolean;
  name?: string;
}

/** Thrown on any token-verification or configuration failure. Endpoints map it to 401. */
export class SocialAuthError extends Error {}

// Thrown when REGISTRATION_DISABLED blocks creating a NEW account via social
// login. Extends SocialAuthError so existing route handlers reject it cleanly.
export class RegistrationDisabledError extends SocialAuthError {}

function googleAudiences(): string[] {
  return [process.env.GOOGLE_CLIENT_ID_WEB, process.env.GOOGLE_CLIENT_ID_IOS].filter(Boolean) as string[];
}

function appleAudiences(): string[] {
  return (process.env.APPLE_CLIENT_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
}

const googleClient = new OAuth2Client();
const APPLE_ISSUER = 'https://appleid.apple.com';
const appleJWKS = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

export async function verifyGoogleIdToken(idToken: string): Promise<SocialIdentity> {
  const audience = googleAudiences();
  if (audience.length === 0) throw new SocialAuthError('Google login not configured');
  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken, audience });
    payload = ticket.getPayload();
  } catch {
    throw new SocialAuthError('Invalid Google token');
  }
  if (!payload || !payload.sub) throw new SocialAuthError('Invalid Google token');
  return {
    provider: 'google',
    sub: payload.sub,
    email: payload.email,
    emailVerified: payload.email_verified === true,
    name: payload.name,
  };
}

export async function verifyAppleIdToken(
  idToken: string,
  expectedNonce?: string,
  name?: unknown,
): Promise<SocialIdentity> {
  const audience = appleAudiences();
  if (audience.length === 0) throw new SocialAuthError('Apple login not configured');
  let payload;
  try {
    ({ payload } = await jwtVerify(idToken, appleJWKS, { issuer: APPLE_ISSUER, audience }));
  } catch {
    throw new SocialAuthError('Invalid Apple token');
  }
  if (!payload.sub) throw new SocialAuthError('Invalid Apple token');
  if (expectedNonce && payload.nonce !== expectedNonce) throw new SocialAuthError('Nonce mismatch');
  return {
    provider: 'apple',
    sub: payload.sub,
    email: typeof payload.email === 'string' ? payload.email : undefined,
    emailVerified: true, // Apple only issues tokens for verified Apple IDs
    name: typeof name === 'string' ? name : undefined,
  };
}

/**
 * Resolve a verified social identity to a User:
 *   1. existing user with this provider sub → return it
 *   2. verified email matches an existing user → link the provider sub onto it
 *   3. otherwise create a new USER (no password)
 * Linking happens ONLY for verified emails (prevents account takeover).
 */
export async function resolveSocialUser(identity: SocialIdentity): Promise<User> {
  const subField = identity.provider === 'google' ? 'googleSub' : 'appleSub';

  const bySub = await prisma.user.findFirst({ where: { [subField]: identity.sub } });
  if (bySub) return bySub;

  if (identity.email && identity.emailVerified) {
    const email = identity.email.toLowerCase();
    const byEmail = await prisma.user.findUnique({ where: { email } });
    if (byEmail) {
      return prisma.user.update({ where: { id: byEmail.id }, data: { [subField]: identity.sub } });
    }
  }

  // No existing account matched → this would be a NEW registration. Honour the
  // same lock as the password-register path (linking an existing account above
  // is still allowed — that's a login, not a new signup).
  if (process.env.REGISTRATION_DISABLED === 'true') {
    throw new RegistrationDisabledError('Registration is disabled');
  }

  // Use the real email only when it is verified (we already know no account owns it at this
  // point). For unverified emails fall back to a synthetic address so we never collide with an
  // existing account that owns that address.
  const newEmail = (identity.email && identity.emailVerified)
    ? identity.email.toLowerCase()
    : `${identity.provider}_${identity.sub}@users.noreply.local`;
  return prisma.user.create({
    data: {
      email: newEmail,
      name: identity.name || identity.email?.split('@')[0] || 'User',
      role: 'USER',
      [subField]: identity.sub,
    },
  });
}
