import { NextRequest, NextResponse } from "next/server";
import { assertAdmin } from "@/lib/admin";
import { listOverrides, releaseOverride, grantOverride } from "@/lib/overrides";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = assertAdmin(req);
  if (auth) return auth;

  const rows = await listOverrides();
  const data = rows.map(r => ({ ...r, expiresInSeconds: Math.max(0, Math.ceil(r.expiresInMs / 1000)) }));
  return NextResponse.json({ overrides: data }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(req: NextRequest) {
  const auth = assertAdmin(req);
  if (auth) return auth;

  const ip = new URL(req.url).searchParams.get("ip");
  if (!ip) return NextResponse.json({ error: "ip is required" }, { status: 400 });
  await releaseOverride(ip);
  const rows = await listOverrides();
  return NextResponse.json({ ok: true, count: rows.length }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const auth = assertAdmin(req);
  if (auth) return auth;

  const { ip, minutes, uses } = await req.json().catch(() => ({}));
  if (!ip || !minutes || !uses) {
    return NextResponse.json({ error: "ip, minutes and uses are required" }, { status: 400 });
  }
  await grantOverride(String(ip), Number(minutes), Number(uses));
  const rows = await listOverrides();
  return NextResponse.json({ ok: true, count: rows.length }, { headers: { "Cache-Control": "no-store" } });
}
