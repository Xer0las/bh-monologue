import { redis } from './kv';

export type CouponTemplate = { minutes: number; uses: number };

// Redis key conventions
const COUPON_PREFIX = 'coupon:';          // coupon:<code>
const COUPON_INDEX  = 'coupon:index';     // set of <code>

// In-memory fallback when Redis isn't configured
const memCoupons = new Map<string, CouponTemplate>();

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
      const exists = await client.exists(COUPON_PREFIX + key);
      if (!exists) {
        await client.set(COUPON_PREFIX + key, JSON.stringify({ minutes, uses }));
        await client.sadd(COUPON_INDEX, key); // keep index in sync
      }
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
      return raw ? (JSON.parse(String(raw)) as CouponTemplate) : null;
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
    await client.set(COUPON_PREFIX + key, JSON.stringify({ minutes, uses }));
    await client.sadd(COUPON_INDEX, key); // index first-class
  } else {
    memCoupons.set(key, { minutes, uses });
  }
}

export async function listCoupons(): Promise<{ code: string; minutes: number; uses: number }[]> {
  const client = redis;

  if (client) {
    try {
      // 1) Prefer the index (fast)
      let codes = (await client.smembers(COUPON_INDEX)) as unknown as string[] | null;

      // 2) Fallback: discover via KEYS (if index empty or missing)
      if (!codes || codes.length === 0) {
        const keys = (await client.keys(`${COUPON_PREFIX}*`)) as unknown as string[] | null;
        codes = (keys || [])
          .filter((k) => k.startsWith(COUPON_PREFIX) && k !== COUPON_INDEX)
          .map((k) => k.slice(COUPON_PREFIX.length));
      }

      if (!codes || codes.length === 0) return [];

      // Fetch values in parallel
      const vals = await Promise.all(
        codes.map((c) => client.get(COUPON_PREFIX + c) as Promise<string | null>)
      );

      const out: { code: string; minutes: number; uses: number }[] = [];
      codes.forEach((c, i) => {
        const raw = vals[i];
        if (!raw) return;
        try {
          const tpl = JSON.parse(String(raw)) as CouponTemplate;
          out.push({ code: c, ...tpl });
        } catch {
          /* skip malformed */
        }
      });
      return out;
    } catch {
      // On any Redis hiccup, return empty (UI will show none)
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
  itemsByCode: Record<string, CouponTemplate | null>;
  itemsByKey: Record<string, CouponTemplate | null>;
}> {
  const client = redis;

  if (!client) {
    return {
      indexCodes: Array.from(memCoupons.keys()),
      keyPattern: Array.from(memCoupons.keys()).map((c) => COUPON_PREFIX + c),
      itemsByCode: Object.fromEntries(Array.from(memCoupons.entries())),
      itemsByKey: Object.fromEntries(
        Array.from(memCoupons.entries()).map(([c, v]) => [COUPON_PREFIX + c, v])
      ),
    };
  }

  const out = {
    indexCodes: [] as string[],
    keyPattern: [] as string[],
    itemsByCode: {} as Record<string, CouponTemplate | null>,
    itemsByKey: {} as Record<string, CouponTemplate | null>,
  };

  try {
    const codes = (await client.smembers(COUPON_INDEX)) as unknown as string[] | null;
    out.indexCodes = codes || [];
  } catch {
    out.indexCodes = [];
  }

  try {
    const keys = (await client.keys(`${COUPON_PREFIX}*`)) as unknown as string[] | null;
    out.keyPattern = keys || [];
  } catch {
    out.keyPattern = [];
  }

  // Read values (best-effort)
  if (out.indexCodes.length) {
    const vals = await Promise.all(
      out.indexCodes.map((c) => client.get(COUPON_PREFIX + c) as Promise<string | null>)
    );
    out.indexCodes.forEach((c, i) => {
      const raw = vals[i];
      try { out.itemsByCode[c] = raw ? (JSON.parse(String(raw)) as CouponTemplate) : null; }
      catch { out.itemsByCode[c] = null; }
    });
  }

  if (out.keyPattern.length) {
    const vals = await Promise.all(
      out.keyPattern.map((k) => client.get(k) as Promise<string | null>)
    );
    out.keyPattern.forEach((k, i) => {
      const raw = vals[i];
      try { out.itemsByKey[k] = raw ? (JSON.parse(String(raw)) as CouponTemplate) : null; }
      catch { out.itemsByKey[k] = null; }
    });
  }

  return out;
}
