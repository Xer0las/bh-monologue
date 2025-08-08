import { NextRequest, NextResponse } from 'next/server';
import { assertAdmin } from '@/lib/admin';
import { redis } from '@/lib/kv';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const auth = assertAdmin(req);
  if (auth) return auth;

  let connected = false;
  let error: string | null = null;
  let couponsCount: number | null = null;

  if (redis) {
    try {
      await redis.get('diag:ping'); // lightweight network check
      connected = true;
      const codes = await redis.smembers<string>('coupon:index');
      couponsCount = (codes || []).length;
    } catch (e: any) {
      error = e?.message || 'redis error';
    }
  }

  return NextResponse.json(
    {
      storage: redis ? 'redis' : 'memory',
      redis: { present: !!redis, connected, error },
      env: {
        url: !!process.env.UPSTASH_REDIS_REST_URL,
        token: !!process.env.UPSTASH_REDIS_REST_TOKEN,
      },
      couponsCount,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
