export type Override = { remaining: number; expiresAt: number };

const overrides = new Map<string, Override>(); // key: ip

export function grantIp(ip: string, minutes: number, uses: number) {
  const expiresAt = Date.now() + minutes * 60_000;
  overrides.set(ip, { remaining: uses, expiresAt });
}

export function getOverride(ip: string): Override | null {
  const o = overrides.get(ip);
  if (!o) return null;
  if (o.expiresAt <= Date.now()) {
    overrides.delete(ip);
    return null;
  }
  return o;
}

/** Core consume: spend one use if an override exists and has remaining. */
export function consume(ip: string): boolean {
  const o = getOverride(ip);
  if (!o || o.remaining <= 0) return false;
  o.remaining -= 1;
  return true;
}

export function release(ip: string) {
  overrides.delete(ip);
}

export function listOverrides() {
  const now = Date.now();
  return Array.from(overrides.entries())
    .filter(([_, o]) => o.expiresAt > now)
    .map(([ip, o]) => ({ ip, remaining: o.remaining, expiresInMs: o.expiresAt - now }));
}

/** --- Compatibility wrappers expected by your monologue routes --- */
export function hasOverride(ip: string): boolean {
  const o = getOverride(ip);
  return !!(o && o.remaining > 0);
}

export function consumeOverride(ip: string): boolean {
  return consume(ip);
}
