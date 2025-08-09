import { NextRequest, NextResponse } from 'next/server';
import { ipFromHeaders } from '@/lib/ip';
import { getCouponTemplate } from '@/lib/coupons';
import { grantOverride, getOverride } from '@/lib/overrides';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const ip = ipFromHeaders(req.headers) || 'unknown';
  const o = await getOverride(ip);
  if (!o) {
    return NextResponse.json({ unlocked: false }, { headers: { 'Cache-Control': 'no-store' } });
  }
  const secondsLeft = Math.max(0, Math.ceil(o.expiresInMs / 1000));
  return NextResponse.json(
    {
      unlocked: o.remaining > 0 && secondsLeft > 0,
      remaining: o.remaining,
      secondsLeft,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function POST(req: NextRequest) {
  const { code } = await req.json().catch(() => ({}));
  if (!code || !String(code).trim()) {
    return NextResponse.json({ error: 'Missing code' }, { status: 400 });
  }

  const tpl = await getCouponTemplate(String(code).trim().toLowerCase());
  if (!tpl) {
    return NextResponse.json({ error: 'Invalid or expired code' }, { status: 400 });
  }

  const ip = ipFromHeaders(req.headers) || 'unknown';
  await grantOverride(ip, tpl.minutes, tpl.uses);

  return NextResponse.json(
    { ok: true, minutes: tpl.minutes, uses: tpl.uses },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
