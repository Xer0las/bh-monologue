import { redis } from './kv';

export type Override = { remaining: number; expiresAt: number };

// ----- In-memory fallback -----
const mem = new Map<string, Override>(); // key: ip
const mk = (ip: string) => `override:${ip}`;

// ----- Helpers -----
function now() { return Date.now(); }
function minsToMs(m: number) { return m * 60_000; }
function secs(n: number) { return n * 60; }

// ----- Public API (async to support Redis) -----
export async function grantIp(ip: string, minutes: number, uses: number) {
  const expiresAt = now() + minsToMs(minutes);
  if (redis) {
    await redis.hset(mk(ip), { remaining: uses, expiresAt });
    await redis.expire(mk(ip), secs(minutes));
  } else {
    mem.set(ip, { remaining: uses, expiresAt });
  }
}

export async function getOverride(ip: string): Promise<Override | null> {
  if (redis) {
    const data = await redis.hgetall<Record<string, string | number>>(mk(ip));
    if (!data || data.remaining === undefined) return null;
    const o = { remaining: Number(data.remaining), expiresAt: Number(data.expiresAt) };
    return o.expiresAt > now() ? o : null;
  }
  const o = mem.get(ip);
  if (!o) return null;
  if (o.expiresAt <= now()) { mem.delete(ip); return null; }
  return o;
}

export async function consume(ip: string): Promise<boolean> {
  if (redis) {
    // Simple two-step check+decrement. Fine for low traffic.
    const key = mk(ip);
    const curStr = await redis.hget<string>(key, 'remaining');
    const cur = Number(curStr ?? 0);
    if (cur <= 0) return false;
    const newVal = await redis.hincrby(key, 'remaining', -1);
    if (newVal < 0) { await redis.hset(key, { remaining: 0 }); return false; }
    return true;
  }
  const o = await getOverride(ip);
  if (!o || o.remaining <= 0) return false;
  o.remaining -= 1;
  return true;
}

export async function release(ip: string) {
  if (redis) await redis.del(mk(ip));
  else mem.delete(ip);
}

export async function listOverrides(): Promise<{ ip: string; remaining: number; expiresInMs: number }[]> {
  const t = now();
  if (redis) {
    // OK at small scale. Swap to SCAN in future.
    const keys = await redis.keys('override:*');
    const out: { ip: string; remaining: number; expiresInMs: number }[] = [];
    for (const key of keys) {
      const data = await redis.hgetall<Record<string, string | number>>(key);
      if (!data) continue;
      const remaining = Number(data.remaining ?? 0);
      const expiresAt = Number(data.expiresAt ?? 0);
      if (expiresAt > t) out.push({ ip: key.slice('override:'.length), remaining, expiresInMs: expiresAt - t });
    }
    return out;
  }
  return Array.from(mem.entries())
    .filter(([_, o]) => o.expiresAt > t)
    .map(([ip, o]) => ({ ip, remaining: o.remaining, expiresInMs: o.expiresAt - t }));
}

// ----- Compatibility wrappers used in your routes -----
export async function hasOverride(ip: string): Promise<boolean> {
  const o = await getOverride(ip);
  return !!(o && o.remaining > 0);
}
export async function consumeOverride(ip: string): Promise<boolean> {
  return consume(ip);
}
