// src/app/api/metrics/route.ts
import { NextResponse } from "next/server";
import { headers } from "next/headers";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { event = "unknown", data = {} } = await req.json().catch(() => ({}));

    const h = headers();
    const ua = h.get("user-agent") || "";
    const ip =
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      h.get("cf-connecting-ip") ||
      "unknown";

    const ts = new Date().toISOString();

    // This shows up in Render → Logs. You’ll be able to grep by [metrics].
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
  // health check
  return NextResponse.json({ ok: true, route: "metrics" });
}
