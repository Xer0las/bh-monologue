import { NextRequest, NextResponse } from "next/server";
import { assertAdmin } from "@/lib/admin";
import { listCoupons } from "@/lib/coupons";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = assertAdmin(req);
  if (auth) return auth;

  const rows = await listCoupons();
  let csv = "code,minutes,uses\n";
  for (const r of rows) {
    csv += `${r.code},${r.minutes},${r.uses}\n`;
  }
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="coupons.csv"',
      "Cache-Control": "no-store",
    },
  });
}
