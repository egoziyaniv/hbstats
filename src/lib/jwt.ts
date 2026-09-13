import jwt from 'jsonwebtoken';

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not set');
  return secret;
}

export function signAccessToken(userId: string, sessionId: string, issuedAt = new Date()): string {
  return jwt.sign({ userId, sessionId, iat: Math.floor(issuedAt.getTime() / 1000) }, getSecret(), {
    algorithm: 'HS256',
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  });
}

export function verifyAccessToken(token: string): { userId: string; sessionId: string } | null {
  try {
    const decoded = jwt.verify(token, getSecret(), { algorithms: ['HS256'] });
    if (
      typeof decoded === 'object' &&
      decoded !== null &&
      'userId' in decoded &&
      typeof decoded.userId === 'string' &&
      typeof decoded.sessionId === 'string' && decoded.sessionId.length > 0
    ) {
      return { userId: decoded.userId, sessionId: decoded.sessionId };
    }
    return null;
  } catch {
    return null;
  }
}
