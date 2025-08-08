import { redis } from './kv';

export type CouponTemplate = { minutes: number; uses: number };
const COUPONS_HASH = 'coupons';

// Seed default from env exactly once (best-effort; ignores errors).
async function seedDefaultFromEnv() {
  const code = process.env.COUPON_CODE;
  const minutes = parseInt(process.env.COUPON_MINUTES || '0', 10);
  const uses = parseInt(process.env.COUPON_USES || '0', 10);
  if (!code || minutes <= 0 || uses <= 0) return;

  const key = code.toLowerCase();
  if (redis) {
    const exists = await redis.hexists(COUPONS_HASH, key);
    if (!exists) await redis.hset(COUPONS_HASH, { [key]: JSON.stringify({ minutes, uses }) });
  } else {
    memCoupons.set(key, { minutes, uses });
  }
}
const memCoupons = new Map<string, CouponTemplate>();
seedDefaultFromEnv().catch(() => {});

// Unified async API (works with Redis or in-memory)
export async function getCouponTemplate(code: string): Promise<CouponTemplate | null> {
  const key = code.toLowerCase();
  if (redis) {
    const raw = await redis.hget<string>(COUPONS_HASH, key);
    return raw ? (JSON.parse(raw) as CouponTemplate) : null;
  }
  return memCoupons.get(key) ?? null;
}

export async function upsertCoupon(code: string, minutes: number, uses: number) {
  const key = code.toLowerCase();
  if (redis) {
    await redis.hset(COUPONS_HASH, { [key]: JSON.stringify({ minutes, uses }) });
  } else {
    memCoupons.set(key, { minutes, uses });
  }
}

export async function listCoupons(): Promise<{ code: string; minutes: number; uses: number }[]> {
  if (redis) {
    const all = await redis.hgetall<Record<string, string>>(COUPONS_HASH);
    const out: { code: string; minutes: number; uses: number }[] = [];
    if (all) for (const [code, raw] of Object.entries(all)) {
      try { const tpl = JSON.parse(raw); out.push({ code, ...tpl }); } catch {}
    }
    return out;
  }
  return Array.from(memCoupons.entries()).map(([code, v]) => ({ code, ...v }));
}
