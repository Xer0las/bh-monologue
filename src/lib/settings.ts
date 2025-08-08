import { redis } from './kv';

export type Defaults = { defaultMinutes: number; defaultUses: number };

const SETTINGS_KEY = 'settings:defaults';

// In-memory fallback
let memDefaults: Defaults | null = null;

function envDefaults(): Defaults {
  const minutes = parseInt(process.env.COUPON_MINUTES || '10080', 10);
  const uses = parseInt(process.env.COUPON_USES || '100', 10);
  return {
    defaultMinutes: Number.isFinite(minutes) && minutes > 0 ? minutes : 10080,
    defaultUses: Number.isFinite(uses) && uses > 0 ? uses : 100,
  };
}

export async function getDefaults(): Promise<Defaults> {
  const client = redis;
  if (client) {
    try {
      const raw = await client.get(SETTINGS_KEY);
      if (raw && typeof raw === 'object') {
        const dm = Number((raw as any)?.defaultMinutes);
        const du = Number((raw as any)?.defaultUses);
        if (Number.isFinite(dm) && Number.isFinite(du)) {
          return { defaultMinutes: dm, defaultUses: du };
        }
      }
      if (typeof raw === 'string') {
        try {
          const obj = JSON.parse(raw);
          const dm = Number(obj?.defaultMinutes);
          const du = Number(obj?.defaultUses);
          if (Number.isFinite(dm) && Number.isFinite(du)) {
            return { defaultMinutes: dm, defaultUses: du };
          }
        } catch { /* fallthrough */ }
      }
    } catch { /* fallthrough */ }
    // not set -> fall back to env
    return envDefaults();
  }

  // memory fallback
  return memDefaults ?? (memDefaults = envDefaults());
}

export async function setDefaults(defaultMinutes: number, defaultUses: number): Promise<void> {
  const dm = Math.max(1, Math.floor(defaultMinutes));
  const du = Math.max(1, Math.floor(defaultUses));
  const client = redis;
  if (client) {
    await client.set(SETTINGS_KEY, { defaultMinutes: dm, defaultUses: du } as any);
    return;
  }
  memDefaults = { defaultMinutes: dm, defaultUses: du };
}
