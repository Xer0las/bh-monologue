// src/lib/settings.ts
//
// Global, app-wide default generation settings (no coupon dependency).
// Uses Upstash Redis if available; otherwise falls back to an in-memory singleton
// so the app still runs locally. In-memory fallback will reset on server restart.

type DefaultSettings = {
  age: string;
  genre: string;
  length: string;
  level: string;
  period: string;
  model?: string; // keep optional so older callers don’t break
};

const DEFAULTS: DefaultSettings = {
  age: "Teens 14–17",
  genre: "Comedy",
  length: "Medium (45–60s)",
  level: "Beginner",
  period: "Contemporary",
  model: "gpt-4o",
};

const KEY = "bh:monologues:global-defaults:v1";

// --- Minimal Redis client (Upstash REST) – optional ---
async function redisGet<T>(key: string): Promise<T | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  const resp = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!resp.ok) return null;
  const data = await resp.json().catch(() => null) as any;
  // Upstash returns { result: "string or null" }
  if (!data || typeof data.result === "undefined" || data.result === null) return null;
  try {
    return JSON.parse(data.result) as T;
  } catch {
    return null;
  }
}

async function redisSet<T>(key: string, value: T): Promise<void> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return;
  await fetch(`${url}/set/${encodeURIComponent(key)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ value: JSON.stringify(value) }),
  }).catch(() => {});
}

// --- In-memory fallback (resets on cold start) ---
const mem: { defaults?: DefaultSettings } =
  (globalThis as any).__BH_SETTINGS__ ?? ((globalThis as any).__BH_SETTINGS__ = {});

// --- Public API ---

/**
 * Returns the global default generation settings for ALL visitors.
 * Order of precedence:
 *   1) persisted value in Redis (if configured)
 *   2) in-memory value set during this process lifetime
 *   3) built-in DEFAULTS above
 */
export async function getDefaults(): Promise<DefaultSettings> {
  // 1) Redis
  const fromRedis = await redisGet<DefaultSettings>(KEY);
  if (fromRedis && typeof fromRedis === "object") {
    return { ...DEFAULTS, ...fromRedis };
  }

  // 2) memory
  if (mem.defaults) {
    return { ...DEFAULTS, ...mem.defaults };
  }

  // 3) built-in
  return { ...DEFAULTS };
}

/**
 * Overwrites the global defaults for everyone. Persists to Redis when available
 * and also updates in-memory so the new value is visible immediately.
 */
export async function setDefaults(next: Partial<DefaultSettings>): Promise<DefaultSettings> {
  const current = await getDefaults();
  const merged: DefaultSettings = {
    ...current,
    ...Object.fromEntries(
      Object.entries(next).filter(([_, v]) => typeof v !== "undefined")
    ),
  };

  mem.defaults = merged;
  await redisSet(KEY, merged).catch(() => {});
  return merged;
}

/**
 * Resets global defaults back to the built-in values.
 */
export async function resetDefaults(): Promise<DefaultSettings> {
  mem.defaults = { ...DEFAULTS };
  await redisSet(KEY, mem.defaults).catch(() => {});
  return mem.defaults;
}
