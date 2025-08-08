import { NextRequest, NextResponse } from 'next/server';
import { assertAdmin } from '@/lib/admin';
import { redis } from '@/lib/kv';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const auth = assertAdmin(req);
  if (auth) return auth;

  const status = {
    storage: redis ? 'redis' as const : 'memory' as const,
    env: {
      url: !!process.env.UPSTASH_REDIS_REST_URL,
      token: !!process.env.UPSTASH_REDIS_REST_TOKEN,
    },
    redis: { present: !!redis, connected: false, error: null as string | null },
    couponsCount: null as number | null,
  };

  if (redis) {
    try {
      // lightweight network check
      await redis.get('diag:ping');
      status.redis.connected = true;

      // Explicit cast instead of generics to appease TS
      const codes = (await redis.smembers('coupon:index')) as unknown as string[];
      status.couponsCount = Array.isArray(codes) ? codes.length : 0;
    } catch (e: any) {
      status.redis.error = e?.message || 'redis error';
    }
  }

  return NextResponse.json(status, { headers: { 'Cache-Control': 'no-store' } });
}
