// src/app/api/coupon/route.ts
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { grantOverride, getOverrideStatus } from "@/lib/overrides";

export const runtime = "nodejs";

// Configurable via env if you want later
const COUPON_CODE = process.env.COUPON_CODE ?? "chickenpotpie";
// Default: unlimited uses, no expiry (you can change below)
const COUPON_MINUTES = Number(process.env.COUPON_MINUTES ?? "0");  // 0 = no expiry
const COUPON_USES = Number(process.env.COUPON_USES ?? "-1");       // -1 = unlimited

export async function GET() {
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("cf-connecting-ip") ||
    "unknown";
  const status = getOverrideStatus(ip);
  return NextResponse.json({ ok: true, ip, ...status });
}

export async function POST(req: Request) {
  try {
    const { code } = await req.json();
    if (typeof code !== "string" || !code.trim()) {
      return NextResponse.json({ ok: false, error: "Missing code." }, { status: 400 });
    }

    if (code.trim().toLowerCase() !== COUPON_CODE.toLowerCase()) {
      return NextResponse.json({ ok: false, error: "Invalid code." }, { status: 401 });
    }

    const h = await headers();
    const ip =
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      h.get("cf-connecting-ip") ||
      "unknown";

    // uses < 0 => unlimited; minutes <= 0 => no expiry
    const uses = COUPON_USES < 0 ? null : COUPON_USES;
    grantOverride(ip, { minutes: COUPON_MINUTES, uses });

    const status = { ok: true, unlocked: true, ip, minutes: COUPON_MINUTES, uses: uses ?? null };
    console.log(`[coupon] ip=${ip} unlocked uses=${uses ?? "unlimited"} minutes=${COUPON_MINUTES}`);
    return NextResponse.json(status);
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Bad request" },
      { status: 400 }
    );
  }
}
