import { redis } from './kv';

export type CouponTemplate = { minutes: number; uses: number };

// Redis keys
const COUPON_KEY = (code: string) => `coupon:${code.toLowerCase()}`;
const COUPON_INDEX = 'coupon:index';

// In-memory fallback when Redis env vars aren't set
const memCoupons = new Map<string, CouponTemplate>();

// Seed default from env once (best-effort)
async function seedDefaultFromEnv() {
  const code = process.env.COUPON_CODE;
  const minutes = parseInt(process.env.COUPON_MINUTES || '0', 10);
  const uses = parseInt(process.env.COUPON_USES || '0', 10);
  if (!code || minutes <= 0 || uses <= 0) return;

  const key = code.toLowerCase();

  if (redis) {
    try {
      const exists = await redis.exists(COUPON_KEY(key));
      if (!exists) {
        await redis.set(COUPON_KEY(key), JSON.stringify({ minutes, uses }));
        await redis.sadd(COUPON_INDEX, key);
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
  if (redis) {
    const raw = await redis.get<string>(COUPON_KEY(key));
    return raw ? (JSON.parse(raw) as CouponTemplate) : null;
  }
  return memCoupons.get(key) ?? null;
}

export async function upsertCoupon(code: string, minutes: number, uses: number) {
  const key = code.toLowerCase();
  if (redis) {
    await redis.set(COUPON_KEY(key), JSON.stringify({ minutes, uses }));
    await redis.sadd(COUPON_INDEX, key);
  } else {
    memCoupons.set(key, { minutes, uses });
  }
}

export async function listCoupons(): Promise<{ code: string; minutes: number; uses: number }[]> {
  if (redis) {
    const codes = await redis.smembers<string>(COUPON_INDEX);
    if (!codes || codes.length === 0) return [];
    // Fetch all in parallel
    const raws = await Promise.all(codes.map((c) => redis.get<string>(COUPON_KEY(c))));
    const out: { code: string; minutes: number; uses: number }[] = [];
    codes.forEach((c, i) => {
      const raw = raws[i];
      if (!raw) return;
      try {
        const tpl = JSON.parse(raw) as CouponTemplate;
        out.push({ code: c, ...tpl });
      } catch {
        // ignore bad entries
      }
    });
    return out;
  }
  return Array.from(memCoupons.entries()).map(([code, v]) => ({ code, ...v }));
}
