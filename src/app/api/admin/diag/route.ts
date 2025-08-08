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

  const client = redis;
  if (client) {
    try {
      await client.get('diag:ping'); // lightweight check
      status.redis.connected = true;

      const keys = (await client.keys('coupon:*')) as unknown as string[];
      const dataKeys = (keys || []).filter((k) => k !== 'coupon:index');
      status.couponsCount = dataKeys.length;
    } catch (e: any) {
      status.redis.error = e?.message || 'redis error';
    }
  }

  return NextResponse.json(status, { headers: { 'Cache-Control': 'no-store' } });
}
