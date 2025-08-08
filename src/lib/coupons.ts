import { redis } from './kv';

export type CouponTemplate = { minutes: number; uses: number };

// Redis keys
const COUPON_PREFIX = 'coupon:';
const COUPON_INDEX = 'coupon:index'; // still maintained, but listing uses KEYS for robustness

// In-memory fallback when Redis isn't configured
const memCoupons = new Map<string, CouponTemplate>();

// Seed default from env once (best-effort)
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
        await client.sadd(COUPON_INDEX, key); // optional index
      }
    } catch {
      // ignore seed errors
    }
  } else {
    if (!memCoupons.has(key)) memCoupons.set(key, { minutes, uses });
  }
}
seedDefaultFromEnv().catch(() => {});

// Unified async API

export async function getCouponTemplate(code: string): Promise<CouponTemplate | null> {
  const key = code.toLowerCase();
  const client = redis;

  if (client) {
    const raw = await client.get(COUPON_PREFIX + key);
    return raw ? (JSON.parse(String(raw)) as CouponTemplate) : null;
  }
  return memCoupons.get(key) ?? null;
}

export async function upsertCoupon(code: string, minutes: number, uses: number) {
  const key = code.toLowerCase();
  const client = redis;

  if (client) {
    await client.set(COUPON_PREFIX + key, JSON.stringify({ minutes, uses }));
    await client.sadd(COUPON_INDEX, key); // keep index updated (not required for listing)
  } else {
    memCoupons.set(key, { minutes, uses });
  }
}

export async function listCoupons(): Promise<{ code: string; minutes: number; uses: number }[]> {
  const client = redis;

  if (client) {
    // Get all coupon:* keys, ignore the index set
    const keys = (await client.keys(`${COUPON_PREFIX}*`)) as unknown as string[];
    const dataKeys = (keys || []).filter((k) => k.startsWith(COUPON_PREFIX) && k !== COUPON_INDEX);
    if (!dataKeys.length) return [];

    const raws = await Promise.all(
      dataKeys.map((k) => client.get(k) as Promise<string | null>)
    );

    const out: { code: string; minutes: number; uses: number }[] = [];
    dataKeys.forEach((k, i) => {
      const raw = raws[i];
      if (!raw) return;
      try {
        const tpl = JSON.parse(String(raw)) as CouponTemplate;
        const code = k.slice(COUPON_PREFIX.length);
        out.push({ code, ...tpl });
      } catch {
        // ignore bad entries
      }
    });
    return out;
  }

  return Array.from(memCoupons.entries()).map(([code, v]) => ({ code, ...v }));
}
