// src/app/api/admin/settings/route.ts
import { NextResponse } from "next/server";
import { getDefaults, setDefaults } from "@/lib/settings";

export const runtime = "nodejs";

export async function GET() {
  const defaults = await getDefaults();
  return NextResponse.json(
    { ok: true, defaults },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      defaultMinutes?: unknown;
      defaultUses?: unknown;
    };

    const defaultMinutes = Number(body.defaultMinutes);
    const defaultUses = Number(body.defaultUses);

    if (!Number.isFinite(defaultMinutes) || !Number.isFinite(defaultUses)) {
      return NextResponse.json(
        { error: "defaultMinutes and defaultUses are required" },
        { status: 400 }
      );
    }

    // Pass a single argument object (matches your setDefaults signature)
    await setDefaults({ minutes: defaultMinutes, uses: defaultUses });

    const defaults = await getDefaults();
    return NextResponse.json(
      { ok: true, defaults },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? "Server error" }, { status: 500 });
  }
}
