// src/app/api/metrics/route.ts
import { NextResponse } from "next/server";
import { headers } from "next/headers";

export const runtime = "nodejs";

// --- in-memory stats (since last deploy / server start)
type MetricEvent = {
  ts: string;
  event: string;
  ip: string;
  data?: Record<string, unknown>;
};
const startedAt = new Date().toISOString();
const counts: Record<string, number> = {
  pageview: 0,
  generate_clicked: 0,
};
const recent: MetricEvent[] = []; // newest first, capped at 200

function pushEvent(ev: MetricEvent) {
  recent.unshift(ev);
  if (recent.length > 200) recent.pop();
  if (ev.event in counts) counts[ev.event] += 1;
}

export async function POST(req: Request) {
  try {
    const { event = "unknown", data = {} } = await req.json().catch(() => ({}));

    const h = await headers();
    const ua = h.get("user-agent") ?? "";
    const ip =
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      h.get("cf-connecting-ip") ||
      "";

    const ts = new Date().toISOString();

    // record in memory
    pushEvent({ ts, event, ip, data });

    // also log to Render logs for tailing/grep
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

export async function GET(req: Request) {
  const url = new URL(req.url);
  // health check by default
  if (url.searchParams.get("stats") !== "1") {
    return NextResponse.json({ ok: true, route: "metrics" });
  }

  // return stats for /admin
  return NextResponse.json({
    ok: true,
    startedAt,
    uptimeSec: Math.floor(process.uptime()),
    counts,
    recent: recent.slice(0, 50), // cap payload
  });
}
