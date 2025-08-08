// src/app/api/metrics/route.ts
import { NextResponse } from "next/server";
import { headers } from "next/headers";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { event = "unknown", data = {} } = await req.json().catch(() => ({}));

    const h = await headers(); // <-- await the async headers()
    const ua = h.get("user-agent") ?? "";
    const ip =
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      h.get("cf-connecting-ip") ||
      "";

    const ts = new Date().toISOString();

    console.log(
      `[metrics] ts=${ts} event=${event} ip=${ip} ua="${ua}" data=${JSON.stringify(
        data
      )}`
    );

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "bad request" },
      { status: 400 }
    );
  }
}

export function GET() {
  return NextResponse.json({ ok: true, route: "metrics" });
}
