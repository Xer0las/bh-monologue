// src/app/api/ping/route.ts
import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({ ok: true, pong: true });
}
