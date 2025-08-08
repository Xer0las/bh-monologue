import { NextRequest, NextResponse } from 'next/server';
import { assertAdmin } from '@/lib/admin';
import { getDefaults, setDefaults } from '@/lib/settings';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const auth = assertAdmin(req);
  if (auth) return auth;
  const defaults = await getDefaults();
  return NextResponse.json({ defaults }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const auth = assertAdmin(req);
  if (auth) return auth;

  const { defaultMinutes, defaultUses } = await req.json().catch(() => ({}));
  if (!defaultMinutes || !defaultUses) {
    return NextResponse.json({ error: 'defaultMinutes and defaultUses are required' }, { status: 400 });
  }
  await setDefaults(Number(defaultMinutes), Number(defaultUses));
  const defaults = await getDefaults();
  return NextResponse.json({ ok: true, defaults }, { headers: { 'Cache-Control': 'no-store' } });
}
