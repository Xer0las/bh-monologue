// src/lib/overrides.ts
export type Override = {
  expiresAt: number | null;   // null = no expiry
  remaining: number | null;   // null = unlimited uses
};

const store = new Map<string, Override>(); // keyed by IP

function cleanup(ip: string) {
  const v = store.get(ip);
  if (!v) return;
  if (v.expiresAt && Date.now() > v.expiresAt) {
    store.delete(ip);
  } else if (typeof v.remaining === "number" && v.remaining <= 0) {
    store.delete(ip);
  }
}

export function grantOverride(ip: string, opts?: { minutes?: number; uses?: number | null }) {
  const minutes = typeof opts?.minutes === "number" ? opts!.minutes : 0; // 0 = no expiry
  const uses = typeof opts?.uses === "number" ? opts!.uses : null;        // null = unlimited
  const expiresAt = minutes > 0 ? Date.now() + minutes * 60_000 : null;
  store.set(ip, { expiresAt, remaining: uses });
  return store.get(ip)!;
}

export function hasOverride(ip: string): boolean {
  cleanup(ip);
  return store.has(ip);
}

export function consumeOverride(ip: string): boolean {
  cleanup(ip);
  const v = store.get(ip);
  if (!v) return false;
  if (typeof v.remaining === "number") {
    v.remaining -= 1;
    if (v.remaining <= 0) store.delete(ip);
    else store.set(ip, v);
  }
  return true;
}

export function getOverrideStatus(ip: string) {
  cleanup(ip);
  const v = store.get(ip);
  if (!v) return { unlocked: false };
  const secondsLeft =
    v.expiresAt ? Math.max(0, Math.floor((v.expiresAt - Date.now()) / 1000)) : null;
  return { unlocked: true, remaining: v.remaining, secondsLeft };
}
