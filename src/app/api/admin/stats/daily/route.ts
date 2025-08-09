import { NextRequest, NextResponse } from "next/server";
import { assertAdmin } from "@/lib/admin";
import { getDailyStats } from "@/lib/metrics";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = assertAdmin(req);
  if (auth) return auth;

  const days = Number(new URL(req.url).searchParams.get("days") || "30");
  const points = await getDailyStats(days);
  return NextResponse.json({ days, points }, { headers: { "Cache-Control": "no-store" } });
}
