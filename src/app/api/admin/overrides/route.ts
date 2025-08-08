import { NextRequest, NextResponse } from 'next/server';
import { listOverrides, release } from '@/lib/overrides';
import { assertAdmin } from '@/lib/admin';

export async function GET(req: NextRequest) {
  const auth = assertAdmin(req);
  if (auth) return auth;
  const rows = listOverrides().map(r => ({ ...r, expiresInSeconds: Math.ceil(r.expiresInMs / 1000) }));
  return NextResponse.json({ overrides: rows });
}

export async function DELETE(req: NextRequest) {
  const auth = assertAdmin(req);
  if (auth) return auth;
  const { searchParams } = new URL(req.url);
  const ip = searchParams.get('ip');
  if (!ip) return NextResponse.json({ error: 'Missing ip' }, { status: 400 });
  release(ip);
  return NextResponse.json({ ok: true });
}
