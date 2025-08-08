import { NextRequest, NextResponse } from 'next/server';
import { assertAdmin } from '@/lib/admin';
import { redis } from '@/lib/kv';

export const runtime = 'nodejs';

const COUPON_PREFIX = 'coupon:';
const COUPON_INDEX  = 'coupon:index';

export async function POST(req: NextRequest) {
  const auth = assertAdmin(req);
  if (auth) return auth;

  const client = redis;
  if (!client) {
    return NextResponse.json({ ok: false, error: 'redis not configured' }, { status: 500 });
  }

  const report = {
    deletedWrongType: 0,
    indexPruned: 0,
    checkedKeys: 0,
    checkedCodes: 0,
  };

  // 1) Remove any coupon:* keys that are NOT strings
  try {
    const keys = (await client.keys(`${COUPON_PREFIX}*`)) as unknown as string[] | null;
    for (const k of keys || []) {
      if (k === COUPON_INDEX) continue;
      report.checkedKeys++;
      let t = 'unknown';
      try { t = String(await client.type(k)); } catch {}
      if (t !== 'string') {
        try { await client.del(k); report.deletedWrongType++; } catch {}
      }
    }
  } catch {}

  // 2) Prune index entries that don't have a proper string value
  try {
    const codes = (await client.smembers(COUPON_INDEX)) as unknown as string[] | null;
    for (const c of codes || []) {
      report.checkedCodes++;
      try {
        const t = String(await client.type(COUPON_PREFIX + c));
        if (t !== 'string') {
          try { await client.srem(COUPON_INDEX, c); report.indexPruned++; } catch {}
        }
      } catch {}
    }
  } catch {
    // ignore WRONGTYPE on the index itself
  }

  return NextResponse.json({ ok: true, ...report }, { headers: { 'Cache-Control': 'no-store' } });
}
