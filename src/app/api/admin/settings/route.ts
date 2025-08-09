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
    const body = await req.json().catch(() => ({} as any));
    const { defaultMinutes, defaultUses } = body ?? {};

    // basic validation
    const minutes = Number(defaultMinutes);
    const uses = Number(defaultUses);
    if (!Number.isFinite(minutes) || !Number.isFinite(uses)) {
      return NextResponse.json(
        { error: "defaultMinutes and defaultUses are required" },
        { status: 400 }
      );
    }

    // setDefaults now expects a single object
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
