import { redis } from "./kv";

// Stored as JSON at key ov:ip:<ip>
// { remaining: number, expiresAt: number }
type Stored = { remaining: number; expiresAt: number };

const OV_IP_PREFIX = "ov:ip:";
const OV_INDEX = "ov:index";

// ---- helpers ----
const now = () => Date.now();
const keyFor = (ip: string) => `${OV_IP_PREFIX}${ip}`;
function alive(s: Stored | null): s is Stored {
  if (!s) return false;
  if (s.expiresAt && s.expiresAt <= now()) return false;
  if (typeof s.remaining === "number" && s.remaining <= 0) return false;
  return true;
}

async function getRaw(ip: string): Promise<Stored | null> {
  const client = redis;
  if (!client) return null;
  try {
    const v = await client.get(keyFor(ip));
    if (!v) return null;
    if (typeof v === "object") {
      const rem = Number((v as any)?.remaining);
      const exp = Number((v as any)?.expiresAt);
      return Number.isFinite(rem) && Number.isFinite(exp) ? { remaining: rem, expiresAt: exp } : null;
    }
    if (typeof v === "string") {
      try {
        const o = JSON.parse(v);
        const rem = Number(o?.remaining);
        const exp = Number(o?.expiresAt);
        return Number.isFinite(rem) && Number.isFinite(exp) ? { remaining: rem, expiresAt: exp } : null;
      } catch { return null; }
    }
    return null;
  } catch { return null; }
}

async function setRaw(ip: string, s: Stored) {
  const client = redis;
  if (!client) return;
  await client.set(keyFor(ip), s as any);
  try { await client.sadd(OV_INDEX, ip); } catch {}
}

async function delRaw(ip: string) {
  const client = redis;
  if (!client) return;
  try { await client.del(keyFor(ip)); } catch {}
  try { await client.srem(OV_INDEX, ip); } catch {}
}

// ---------- Public API ----------

export async function grantOverride(ip: string, minutes: number, uses: number) {
  const m = Math.max(1, Math.floor(minutes));
  const u = Math.max(1, Math.floor(uses));
  const s: Stored = { remaining: u, expiresAt: now() + m * 60_000 };
  await setRaw(ip, s);
}

// Back-compat alias for any older imports
export const grantIp = grantOverride;

export async function releaseOverride(ip: string) {
  await delRaw(ip);
}

export async function hasOverride(ip: string): Promise<boolean> {
  const s = await getRaw(ip);
  if (!alive(s)) {
    if (s) await releaseOverride(ip);
    return false;
  }
  return true;
}

export async function consumeOverride(ip: string) {
  const s = await getRaw(ip);
  if (!alive(s)) {
    if (s) await releaseOverride(ip);
    return;
  }
  const next: Stored = { ...s, remaining: Math.max(0, s.remaining - 1) };
  if (!alive(next)) {
    await releaseOverride(ip);
  } else {
    await setRaw(ip, next);
  }
}

export async function listOverrides(): Promise<{ ip: string; remaining: number; expiresInMs: number }[]> {
  const client = redis;
  if (!client) return [];
  let ips: string[] = [];
  try { ips = (await client.smembers(OV_INDEX)) as unknown as string[] || []; } catch { ips = []; }
  if (!ips.length) return [];
  const vals = await Promise.all(ips.map((ip) => getRaw(ip)));
  const out: { ip: string; remaining: number; expiresInMs: number }[] = [];
  await Promise.all(ips.map(async (ip, i) => {
    const s = vals[i];
    if (alive(s)) {
      out.push({ ip, remaining: s!.remaining, expiresInMs: s!.expiresAt - now() });
    } else {
      if (s) await releaseOverride(ip); // prune
    }
  }));
  out.sort((a, b) => a.expiresInMs - b.expiresInMs);
  return out;
}

// Return current override (shape used by /api/coupon GET)
export async function getOverride(ip: string): Promise<{ remaining: number; expiresInMs: number } | null> {
  const s = await getRaw(ip);
  if (!alive(s)) return null;
  return { remaining: s.remaining, expiresInMs: s.expiresAt - now() };
}
