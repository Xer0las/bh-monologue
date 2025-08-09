import { NextRequest, NextResponse } from 'next/server';
import { assertAdmin } from '@/lib/admin';
import { getStats } from '@/lib/metrics';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const auth = assertAdmin(req);
  if (auth) return auth;

  const stats = await getStats();
  return NextResponse.json({ stats }, { headers: { 'Cache-Control': 'no-store' } });
}
