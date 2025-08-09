import { NextRequest, NextResponse } from "next/server";
import { assertAdmin } from "@/lib/admin";
import { getDailyStats } from "@/lib/metrics";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = assertAdmin(req);
  if (auth) return auth;

  const days = Number(new URL(req.url).searchParams.get("days") || "60");
  const pts = await getDailyStats(days);
  let csv = "date,total\n";
  for (const p of pts) {
    csv += `${p.date},${p.total}\n`;
  }
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="stats_daily.csv"',
      "Cache-Control": "no-store",
    },
  });
}
