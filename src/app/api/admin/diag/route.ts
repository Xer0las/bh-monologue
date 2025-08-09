// src/app/api/admin/diag/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * This route is used by /admin/manage to check auth and show basic status.
 * We’ll make it very explicit about WHY auth fails (missing header vs mismatch),
 * without logging the full secret.
 */
export async function GET(req: Request) {
  const adminKeyHeader = req.headers.get("x-admin-key") || "";
  const envKey = process.env.ADMIN_KEY || "";

  // Helpful diagnostics (no secrets leaked)
  const diagnostics = {
    receivedHeader: adminKeyHeader ? `len=${adminKeyHeader.length}` : "missing",
    expectedEnv: envKey ? `len=${envKey.length}` : "missing",
  };

  // 1) Hard fail: no ADMIN_KEY set on the server
  if (!envKey) {
    return NextResponse.json(
      { ok: false, error: "ADMIN_KEY env var is missing on server", diag: diagnostics },
      { status: 401 }
    );
  }

  // 2) Missing header
  if (!adminKeyHeader) {
    return NextResponse.json(
      { ok: false, error: "x-admin-key header missing", diag: diagnostics },
      { status: 401 }
    );
  }

  // 3) Mismatch
  if (adminKeyHeader !== envKey) {
    return NextResponse.json(
      { ok: false, error: "x-admin-key does not match ADMIN_KEY", diag: diagnostics },
      { status: 401 }
    );
  }

  // If we’re here, you’re authenticated. Return basic status the UI expects.
  const hasUrl = Boolean(process.env.UPSTASH_REDIS_REST_URL);
  const hasToken = Boolean(process.env.UPSTASH_REDIS_REST_TOKEN);
  const present = hasUrl && hasToken;

  const status = {
    storage: present ? ("redis" as const) : ("memory" as const),
    redis: {
      present,
      connected: false, // if you later add a live check, flip this
      error: null as string | null,
    },
    env: {
      url: hasUrl,
      token: hasToken,
    },
    couponsCount: null as number | null, // you can wire this to your store later
    ok: true,
    diag: diagnostics,
  };

  return NextResponse.json(status, { headers: { "Cache-Control": "no-store" } });
}
