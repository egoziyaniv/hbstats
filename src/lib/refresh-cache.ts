// In-memory idempotency cache for /auth/refresh.
// Keyed by sha256(refreshToken), stores { accessToken, refreshToken, expiresAt }.
// TTL: 30 seconds. Survives concurrent retries from network failures
// without triggering reuse detection.
//
// Security note (reviewed 2026-07-04): this cache is consulted BEFORE reuse
// detection, so a token replayed within 30s returns the same fresh tokens
// instead of tripping the family revocation. That is an accepted tradeoff for
// mobile retry resilience — the window is short, in-memory (per-process, lost
// on restart), and the rotated token itself is invalidated the moment its
// Session.replacedAt is set (see getRequestUser/getCurrentUser in lib/auth.ts),
// so a stolen token can't ride the cache into a live web session. Tighten the
// TTL or move the reuse check ahead of the cache if this proves insufficient.

interface CachedResponse {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

const cache = new Map<string, CachedResponse>();
const TTL_MS = 30_000;

export function getCachedResponse(tokenHash: string): CachedResponse | null {
  const entry = cache.get(tokenHash);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(tokenHash);
    return null;
  }
  return entry;
}

export function setCachedResponse(tokenHash: string, accessToken: string, refreshToken: string) {
  cache.set(tokenHash, { accessToken, refreshToken, expiresAt: Date.now() + TTL_MS });
}

// Test-only hook
export function _clearIdempotencyCacheForTests() {
  cache.clear();
}
