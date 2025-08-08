import { NextRequest, NextResponse } from 'next/server';
import { listCoupons, upsertCoupon } from '@/lib/coupons';
import { assertAdmin } from '@/lib/admin';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const auth = assertAdmin(req);
  if (auth) return auth;
  const body = { coupons: await listCoupons() };
  return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const auth = assertAdmin(req);
  if (auth) return auth;

  const { code, minutes, uses } = await req.json().catch(() => ({}));
  if (!code || !minutes || !uses) {
    return NextResponse.json({ error: 'code, minutes, and uses are required' }, { status: 400 });
  }
  await upsertCoupon(String(code), Number(minutes), Number(uses));
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
