import { NextRequest, NextResponse } from 'next/server';

export function assertAdmin(req: NextRequest): NextResponse | null {
  const header = req.headers.get('x-admin-key') ?? '';
  const expected = process.env.ADMIN_KEY ?? '';
  if (!expected || header !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}
