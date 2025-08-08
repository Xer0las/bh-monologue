import { NextRequest, NextResponse } from 'next/server';
import { assertAdmin } from '@/lib/admin';
import { debugList } from '@/lib/coupons';
import { redis } from '@/lib/kv';

// ...imports unchanged...
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const auth = assertAdmin(req);
  if (auth) return auth;

  try {
    const base = await debugList();
    const extra: any = { rawByKey: {}, rawLenByKey: {}, rawByCode: {}, rawLenByCode: {} };
    const client = redis;

    if (client) {
      for (const k of base.keyPattern || []) {
        if (k === 'coupon:index') continue;
        try {
          const v = await client.get(k);
          const s = v == null ? null : (typeof v === 'string' ? v : JSON.stringify(v));
          extra.rawByKey[k] = s == null ? null : s.slice(0, 200);
          extra.rawLenByKey[k] = s == null ? 0 : s.length;
        } catch {
          extra.rawByKey[k] = null;
          extra.rawLenByKey[k] = 0;
        }
      }
      for (const c of base.indexCodes || []) {
        const k = `coupon:${c}`;
        try {
          const v = await client.get(k);
          const s = v == null ? null : (typeof v === 'string' ? v : JSON.stringify(v));
          extra.rawByCode[c] = s == null ? null : s.slice(0, 200);
          extra.rawLenByCode[c] = s == null ? 0 : s.length;
        } catch {
          extra.rawByCode[c] = null;
          extra.rawLenByCode[c] = 0;
        }
      }
    }

    return NextResponse.json({ ...base, ...extra }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'debug error' }, { status: 500 });
  }
}

