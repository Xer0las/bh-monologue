import { NextRequest, NextResponse } from 'next/server';
import { ipFromHeaders } from '@/lib/ip';
import { getCouponTemplate } from '@/lib/coupons';
import { grantIp } from '@/lib/overrides';

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
