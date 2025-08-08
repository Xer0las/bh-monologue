// src/lib/ratelimit.ts
export type TakeResult = { allowed: boolean; remaining: number; resetMs: number };

const buckets = new Map<string, number[]>();

/**
 * Sliding-window limiter. Keeps up to `max` timestamps per `windowMs` for a given key.
 * Returns whether the new request is allowed, remaining tokens, and ms until reset.
 */
export function take(key: string, opts: { windowMs?: number; max?: number } = {}): TakeResult {
  const windowMs = opts.windowMs ?? 60_000; // 1 minute
  const max = opts.max ?? 8;                // 8 requests per minute by default
  const now = Date.now();

  const arr = buckets.get(key) ?? [];
  const cutoff = now - windowMs;

  // drop old timestamps
  let i = 0;
  while (i < arr.length && arr[i] <= cutoff) i++;
  if (i > 0) arr.splice(0, i);

  if (arr.length >= max) {
    const resetMs = windowMs - (now - arr[0]);
    return { allowed: false, remaining: 0, resetMs };
  }

  arr.push(now);
  buckets.set(key, arr);

  const remaining = Math.max(0, max - arr.length);
  const resetMs = arr.length ? windowMs - (now - arr[0]) : windowMs;
  return { allowed: true, remaining, resetMs };
}
