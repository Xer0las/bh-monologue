export type CouponTemplate = { minutes: number; uses: number };

const coupons = new Map<string, CouponTemplate>(); // key: code (lowercased)

function seedDefaultFromEnv() {
  const code = process.env.COUPON_CODE;
  const minutes = parseInt(process.env.COUPON_MINUTES || '0', 10);
  const uses = parseInt(process.env.COUPON_USES || '0', 10);
  if (code && minutes > 0 && uses > 0) {
    coupons.set(code.toLowerCase(), { minutes, uses });
  }
}
seedDefaultFromEnv();

export function getCouponTemplate(code: string) {
  return coupons.get(code.toLowerCase());
}

export function upsertCoupon(code: string, minutes: number, uses: number) {
  coupons.set(code.toLowerCase(), { minutes, uses });
}

export function listCoupons() {
  return Array.from(coupons.entries()).map(([code, v]) => ({ code, ...v }));
}
