import { NextRequest, NextResponse } from 'next/server';
import { ipFromHeaders } from '@/lib/ip';
import { getCouponTemplate } from '@/lib/coupons';
import { grantIp, getOverride } from '@/lib/overrides';

export const runtime = 'nodejs';

/**
 * GET /api/coupon
 * Returns current status for the caller's IP:
 * { unlocked: boolean, remaining?: number, secondsLeft?: number }
 */
export async function GET(req: NextRequest) {
  try {
    const ip = ipFromHeaders(req.headers);
    const o = await getOverride(ip);
    if (!o) return NextResponse.json({ unlocked: false });
    const secondsLeft = Math.max(0, Math.ceil((o.expiresAt - Date.now()) / 1000));
    return NextResponse.json({
      unlocked: o.remaining > 0 && secondsLeft > 0,
      remaining: o.remaining,
      secondsLeft,
    });
  } catch (e: any) {
    return NextResponse.json({ unlocked: false, error: e?.message || 'status error' }, { status: 200 });
  }
}

/**
 * POST /api/coupon  { code }
 * Redeems a coupon for the caller's IP. Grants minutes/uses from the template.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const code: string | undefined = body.code;
  if (!code) return NextResponse.json({ error: 'Missing code' }, { status: 400 });

  const tpl = await getCouponTemplate(code);
  if (!tpl) return NextResponse.json({ ok: false, error: 'Invalid code' }, { status: 404 });

  const ip = ipFromHeaders(req.headers);
  await grantIp(ip, tpl.minutes, tpl.uses);

  return NextResponse.json({ ok: true, ip, minutes: tpl.minutes, uses: tpl.uses });
}
