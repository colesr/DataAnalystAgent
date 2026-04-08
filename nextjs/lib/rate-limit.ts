/**
 * In-memory sliding-window rate limiter, keyed by an arbitrary string (IP).
 *
 * Single-instance only — fine for one Railway service. If we ever scale out,
 * swap this for @upstash/ratelimit + Redis.
 */

type Bucket = number[]; // unix-ms timestamps of recent hits

const BUCKETS = new Map<string, Bucket>();

export type RateLimitResult =
  | { ok: true; remaining: number }
  | { ok: false; retryAfterSec: number };

export function rateLimit(
  key: string,
  opts: { limit: number; windowSec: number }
): RateLimitResult {
  const now = Date.now();
  const windowMs = opts.windowSec * 1000;
  const bucket = BUCKETS.get(key) ?? [];

  // Drop entries outside the window.
  const fresh = bucket.filter((t) => now - t < windowMs);

  if (fresh.length >= opts.limit) {
    const oldest = fresh[0];
    const retryAfterSec = Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000));
    BUCKETS.set(key, fresh);
    return { ok: false, retryAfterSec };
  }

  fresh.push(now);
  BUCKETS.set(key, fresh);

  // Periodically prune the map so it doesn't grow forever.
  if (BUCKETS.size > 5000) {
    for (const [k, v] of BUCKETS) {
      if (v.every((t) => now - t >= windowMs)) BUCKETS.delete(k);
    }
  }

  return { ok: true, remaining: opts.limit - fresh.length };
}

/** Best-effort client IP from common Railway/Cloudflare/Vercel headers. */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}
