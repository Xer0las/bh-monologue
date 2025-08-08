import { NextRequest, NextResponse } from 'next/server';
import { listCoupons, upsertCoupon, deleteCoupon } from '@/lib/coupons';
import { assertAdmin } from '@/lib/admin';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const auth = assertAdmin(req);
  if (auth) return auth;

  try {
    const coupons = await listCoupons();
    return NextResponse.json({ coupons }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e: any) {
    return NextResponse.json({ coupons: [], error: e?.message || 'list error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = assertAdmin(req);
  if (auth) return auth;

  try {
    const { code, minutes, uses } = await req.json().catch(() => ({}));
    if (!code || !minutes || !uses) {
      return NextResponse.json({ error: 'code, minutes, and uses are required' }, { status: 400 });
    }

    await upsertCoupon(String(code), Number(minutes), Number(uses));

    const coupons = await listCoupons();
    const present = coupons.some(c => c.code.toLowerCase() === String(code).toLowerCase());
    return NextResponse.json({ ok: true, present, count: coupons.length }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'create error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = assertAdmin(req);
  if (auth) return auth;

  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  if (!code) return NextResponse.json({ error: 'code is required' }, { status: 400 });

  const ok = await deleteCoupon(code);
  const coupons = await listCoupons();
  return NextResponse.json({ ok, count: coupons.length }, { headers: { 'Cache-Control': 'no-store' } });
}
