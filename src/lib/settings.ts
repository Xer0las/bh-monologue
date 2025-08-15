// src/lib/settings.ts
//
// Stores GLOBAL defaults for the whole app, including the visitor allowance
// (defaultMinutes/defaultUses) and optional content/model defaults.
// Persists to Upstash Redis when available; otherwise uses in‑memory fallback.

type DefaultSettings = {
  // Global Visitor Allowance (used by API routes for baseline per‑IP quota)
  defaultMinutes: number; // window length, minutes
  defaultUses: number;    // max uses within that window

  // Optional content/model defaults (kept to avoid breaking other code)
  age?: string;
  genre?: string;
  length?: string;
  level?: string;
  period?: string;
  model?: string;
};

const DEFAULTS: DefaultSettings = {
  // ⬇️ Built‑in defaults (what you want to see on a fresh load)
  defaultMinutes: 10080, // 7 days
  defaultUses: 100,

  // optional content defaults (safe fallbacks)
  age: "Teens 14–17",
  genre: "Comedy",
  length: "Medium (45–60s)",
  level: "Beginner",
  period: "Contemporary",
  model: "gpt-4o",
};

const KEY = "bh:monologues:global-defaults:v1";

// ---- Upstash Redis helpers (optional) ----
async function redisGet<T>(key: string): Promise<T | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  const resp = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!resp.ok) return null;
  const data = (await resp.json().catch(() => null)) as any;
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

// ---- In-memory fallback (resets on cold start) ----
const mem: { defaults?: DefaultSettings } =
  (globalThis as any).__BH_SETTINGS__ ?? ((globalThis as any).__BH_SETTINGS__ = {});

// ---- Public API ----

/** Return the global defaults merged over built-ins. */
export async function getDefaults(): Promise<DefaultSettings> {
  // Try Redis
  const fromRedis = await redisGet<DefaultSettings>(KEY);
  if (fromRedis && typeof fromRedis === "object") {
    return normalize({ ...DEFAULTS, ...fromRedis });
  }
  // Try memory
  if (mem.defaults) {
    return normalize({ ...DEFAULTS, ...mem.defaults });
  }
  // Built-ins
  return normalize({ ...DEFAULTS });
}

/** Update one or more global defaults. */
export async function setDefaults(next: Partial<DefaultSettings>): Promise<DefaultSettings> {
  const current = await getDefaults();
  const merged = normalize({
    ...current,
    ...next,
  });
  mem.defaults = merged;
  await redisSet(KEY, merged).catch(() => {});
  return merged;
}

/** Reset to built-in defaults. */
export async function resetDefaults(): Promise<DefaultSettings> {
  const reset = normalize({ ...DEFAULTS });
  mem.defaults = reset;
  await redisSet(KEY, reset).catch(() => {});
  return reset;
}

// ---- Utilities ----
function normalize(v: DefaultSettings): DefaultSettings {
  // Coerce numeric fields safely
  const mins = Number(v.defaultMinutes);
  const uses = Number(v.defaultUses);
  return {
    ...v,
    defaultMinutes: Number.isFinite(mins) && mins >= 0 ? mins : DEFAULTS.defaultMinutes,
    defaultUses: Number.isFinite(uses) && uses >= 0 ? uses : DEFAULTS.defaultUses,
  };
}
