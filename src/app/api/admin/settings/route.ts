// src/app/api/admin/settings/route.ts
import { NextResponse } from "next/server";
import { getDefaults, setDefaults } from "@/lib/settings";

export const runtime = "nodejs";

export async function GET() {
  try {
    const defaults = await getDefaults();
    return NextResponse.json(
      { ok: true, defaults },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to load defaults" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      defaultMinutes?: unknown;
      defaultUses?: unknown;
    };

    const minutes = Number(body.defaultMinutes);
    const uses = Number(body.defaultUses);

    if (!Number.isFinite(minutes) || !Number.isFinite(uses)) {
      return NextResponse.json(
        { error: "defaultMinutes and defaultUses are required" },
        { status: 400 }
      );
    }

    // IMPORTANT: use the exact property names your settings lib expects
    await setDefaults({ defaultMinutes: minutes, defaultUses: uses });

    const defaults = await getDefaults();
    return NextResponse.json(
      { ok: true, defaults },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to save defaults" },
      { status: 500 }
    );
  }
}
