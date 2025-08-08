import { redis } from './kv';

export type CouponTemplate = { minutes: number; uses: number };

// Redis key conventions
const COUPON_PREFIX = 'coupon:';          // coupon:<code>
const COUPON_INDEX  = 'coupon:index';     // set of <code>

// In-memory fallback when Redis isn't configured
const memCoupons = new Map<string, CouponTemplate>();

// ---- helpers ----
function asTemplate(raw: unknown): CouponTemplate | null {
  if (raw == null) return null;

  // If Upstash client auto-deserialized JSON, we'll get an object here.
  if (typeof raw === 'object') {
    const minutes = Number((raw as any)?.minutes);
    const uses = Number((raw as any)?.uses);
    return Number.isFinite(minutes) && Number.isFinite(uses) ? { minutes, uses } : null;
  }

  // If it returned a string, parse JSON.
  if (typeof raw === 'string') {
    try {
      const obj = JSON.parse(raw);
      const minutes = Number(obj?.minutes);
      const uses = Number(obj?.uses);
      return Number.isFinite(minutes) && Number.isFinite(uses) ? { minutes, uses } : null;
    } catch {
      return null;
    }
  }

  return null;
}

// Seed default from env once (best-effort; never throws)
async function seedDefaultFromEnv() {
  const code = process.env.COUPON_CODE;
  const minutes = parseInt(process.env.COUPON_MINUTES || '0', 10);
  const uses = parseInt(process.env.COUPON_USES || '0', 10);
  if (!code || minutes <= 0 || uses <= 0) return;

  const key = code.toLowerCase();
  const client = redis;

  if (client) {
    try {
      // Overwrite any wrong-type leftovers
      try { await client.del(COUPON_PREFIX + key); } catch {}
      // Store as a plain object (client can handle objects)
      await client.set(COUPON_PREFIX + key, { minutes, uses } as any);
      try { await client.sadd(COUPON_INDEX, key); } catch {}
    } catch {
      /* ignore seed errors */
    }
  } else {
    if (!memCoupons.has(key)) memCoupons.set(key, { minutes, uses });
  }
}
seedDefaultFromEnv().catch(() => {});

// ---------- Public API ----------

export async function getCouponTemplate(code: string): Promise<CouponTemplate | null> {
  const key = code.toLowerCase();
  const client = redis;

  if (client) {
    try {
      const raw = await client.get(COUPON_PREFIX + key);
      return asTemplate(raw);
    } catch {
      return null;
    }
  }
  return memCoupons.get(key) ?? null;
}

export async function upsertCoupon(code: string, minutes: number, uses: number) {
  const key = code.toLowerCase();
  const client = redis;

  if (client) {
    // Delete first so SET always succeeds even if previous type was wrong
    try { await client.del(COUPON_PREFIX + key); } catch {}
    // Store as object; works with Upstash client auto (de)serialization
    await client.set(COUPON_PREFIX + key, { minutes, uses } as any);
    try { await client.sadd(COUPON_INDEX, key); } catch {}
  } else {
    memCoupons.set(key, { minutes, uses });
  }
}

export async function deleteCoupon(code: string): Promise<boolean> {
  const key = code.toLowerCase();
  const client = redis;

  if (client) {
    let ok = true;
    try { await client.del(COUPON_PREFIX + key); } catch { ok = false; }
    try { await client.srem(COUPON_INDEX, key); } catch { /* ignore WRONGTYPE */ }
    return ok;
  }

  return memCoupons.delete(key);
}

export async function listCoupons(): Promise<{ code: string; minutes: number; uses: number }[]> {
  const client = redis;

  if (client) {
    try {
      // 1) Prefer the index (fast) — tolerate WRONGTYPE by falling back
      let codes: string[] | null = null;
      try {
        codes = (await client.smembers(COUPON_INDEX)) as unknown as string[] | null;
      } catch {
        codes = null;
      }

      // 2) Fallback: discover via KEYS (if index empty/missing/wrongtype)
      if (!codes || codes.length === 0) {
        const keys = (await client.keys(`${COUPON_PREFIX}*`)) as unknown as string[] | null;
        codes = (keys || [])
          .filter((k) => k.startsWith(COUPON_PREFIX) && k !== COUPON_INDEX)
          .map((k) => k.slice(COUPON_PREFIX.length));
      }

      if (!codes || codes.length === 0) return [];

      // Fetch values in parallel
      const vals = await Promise.all(
        codes.map(async (c) => {
          try { return await client.get(COUPON_PREFIX + c) as unknown; }
          catch { return null; }
        })
      );

      const out: { code: string; minutes: number; uses: number }[] = [];
      codes.forEach((c, i) => {
        const tpl = asTemplate(vals[i]);
        if (tpl) out.push({ code: c, ...tpl });
      });
      return out;
    } catch {
      return [];
    }
  }

  // In-memory fallback
  return Array.from(memCoupons.entries()).map(([code, v]) => ({ code, ...v }));
}

// ---------- Debug helpers (never throw) ----------

export async function debugList(): Promise<{
  indexCodes: string[];
  keyPattern: string[];
  typesByKey: Record<string, string>;
  itemsByCode: Record<string, CouponTemplate | null>;
  itemsByKey: Record<string, CouponTemplate | null>;
}> {
  const client = redis;

  if (!client) {
    const keys = Array.from(memCoupons.keys()).map((c) => COUPON_PREFIX + c);
    return {
      indexCodes: Array.from(memCoupons.keys()),
      keyPattern: keys,
      typesByKey: Object.fromEntries(keys.map((k) => [k, 'string'])),
      itemsByCode: Object.fromEntries(Array.from(memCoupons.entries())),
      itemsByKey: Object.fromEntries(
        Array.from(memCoupons.entries()).map(([c, v]) => [COUPON_PREFIX + c, v])
      ),
    };
  }

  const out = {
    indexCodes: [] as string[],
    keyPattern: [] as string[],
    typesByKey: {} as Record<string, string>,
    itemsByCode: {} as Record<string, CouponTemplate | null>,
    itemsByKey: {} as Record<string, CouponTemplate | null>,
  };

  // Read index (ignore WRONGTYPE)
  try {
    const codes = (await client.smembers(COUPON_INDEX)) as unknown as string[] | null;
    out.indexCodes = codes || [];
  } catch {
    out.indexCodes = [];
  }

  // Read all keys
  try {
    const keys = (await client.keys(`${COUPON_PREFIX}*`)) as unknown as string[] | null;
    out.keyPattern = keys || [];
  } catch {
    out.keyPattern = [];
  }

  // Types + decoded values by key (skip the index key which may be a set)
  for (const k of out.keyPattern) {
    if (k === COUPON_INDEX) continue;
    try { out.typesByKey[k] = String(await client.type(k)); } catch { out.typesByKey[k] = 'unknown'; }
    try {
      const raw = await client.get(k);
      out.itemsByKey[k] = asTemplate(raw);
    } catch {
      out.itemsByKey[k] = null;
    }
  }

  // Values by code (safe)
  for (const c of out.indexCodes) {
    try {
      const raw = await client.get(COUPON_PREFIX + c);
      out.itemsByCode[c] = asTemplate(raw);
    } catch {
      out.itemsByCode[c] = null;
    }
  }

  return out;
}
