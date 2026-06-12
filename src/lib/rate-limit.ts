// In-memory rate limiter, keyed by an arbitrary string.
// Single-instance only — if StatsAI ever scales horizontally, swap for Redis.

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export function checkRateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  bucket.count += 1;
  return bucket.count <= max;
}

export function getClientIp(request: Request): string {
  // Prefer X-Real-IP: nginx sets it to $remote_addr (the real TCP peer) and
  // overwrites any client-sent value, so it can't be spoofed. X-Forwarded-For
  // is built with $proxy_add_x_forwarded_for, whose FIRST element is whatever
  // the client sent — using it as the key would let an attacker rotate fake
  // IPs to bypass the limit. XFF is only the fallback for non-proxied (dev) use.
  const realIp = request.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;
  const fwd = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return fwd || 'unknown';
}

export function _resetRateLimitForTests() {
  buckets.clear();
}
