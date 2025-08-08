import { NextRequest, NextResponse } from 'next/server';
import { assertAdmin } from '@/lib/admin';
import { redis } from '@/lib/kv';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const auth = assertAdmin(req);
  if (auth) return auth;

  let connected = false;
  let error: string | null = null;

  if (redis) {
    try {
      // lightweight check that also hits the network
      await redis.get('diag:ping');
      connected = true;
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
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
