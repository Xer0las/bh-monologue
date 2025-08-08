import { NextRequest, NextResponse } from 'next/server';
import { assertAdmin } from '@/lib/admin';
import { debugListKeys } from '@/lib/coupons';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const auth = assertAdmin(req);
  if (auth) return auth;

  const dump = await debugListKeys();
  return NextResponse.json(dump, { headers: { 'Cache-Control': 'no-store' } });
}
