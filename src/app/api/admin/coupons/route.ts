import { NextRequest, NextResponse } from 'next/server';
import { listCoupons, upsertCoupon } from '@/lib/coupons';
import { assertAdmin } from '@/lib/admin';

export async function GET(req: NextRequest) {
  const auth = assertAdmin(req);
  if (auth) return auth;
  return NextResponse.json({ coupons: listCoupons() });
}

export async function POST(req: NextRequest) {
  const auth = assertAdmin(req);
  if (auth) return auth;

  const { code, minutes, uses } = await req.json().catch(() => ({}));
  if (!code || !minutes || !uses) {
    return NextResponse.json({ error: 'code, minutes, and uses are required' }, { status: 400 });
  }
  upsertCoupon(String(code), Number(minutes), Number(uses));
  return NextResponse.json({ ok: true });
}
