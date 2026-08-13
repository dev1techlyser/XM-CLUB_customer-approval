/**
 * Lightweight in-memory rate limiter for App Proxy storefront posts.
 * Survives within a single Node process only (Shopify app server / `shopify app dev`).
 * Not a substitute for edge WAF — documented Shopify-native limitation.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

const MAX_ENTRIES = 5000;

export type RateLimitResult =
  | { allowed: true; remaining: number }
  | { allowed: false; retryAfterSec: number };

export function checkRateLimit(params: {
  key: string;
  limit: number;
  windowMs: number;
}): RateLimitResult {
  const now = Date.now();
  pruneIfNeeded(now);

  const existing = buckets.get(params.key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(params.key, {
      count: 1,
      resetAt: now + params.windowMs,
    });
    return { allowed: true, remaining: params.limit - 1 };
  }

  if (existing.count >= params.limit) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  return { allowed: true, remaining: params.limit - existing.count };
}

function pruneIfNeeded(now: number) {
  if (buckets.size < MAX_ENTRIES) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
  if (buckets.size >= MAX_ENTRIES) {
    const first = buckets.keys().next().value;
    if (first) buckets.delete(first);
  }
}
