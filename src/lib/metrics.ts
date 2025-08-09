import { redis } from './kv';

export type GenMeta = {
  age: string;
  genre: string;
  length: string;
  level: string;
  period: string;
};

type Stats = {
  total: number;
  byAge: Record<string, number>;
  byGenre: Record<string, number>;
  byLength: Record<string, number>;
  byLevel: Record<string, number>;
  byPeriod: Record<string, number>;
};

const METRICS_KEY = 'metrics:global';

function fld(scope: string, value: string) {
  return `${scope}::${value}`;
}

// memory fallback
const mem: {
  total: number;
  byAge: Map<string, number>;
  byGenre: Map<string, number>;
  byLength: Map<string, number>;
  byLevel: Map<string, number>;
  byPeriod: Map<string, number>;
} = {
  total: 0,
  byAge: new Map(),
  byGenre: new Map(),
  byLength: new Map(),
  byLevel: new Map(),
  byPeriod: new Map(),
};

export async function recordGeneration(meta: GenMeta) {
  const client = redis;
  if (client) {
    // best-effort; no throws
    await Promise.allSettled([
      client.hincrby(METRICS_KEY, 'total', 1),
      client.hincrby(METRICS_KEY, fld('age', meta.age), 1),
      client.hincrby(METRICS_KEY, fld('genre', meta.genre), 1),
      client.hincrby(METRICS_KEY, fld('length', meta.length), 1),
      client.hincrby(METRICS_KEY, fld('level', meta.level), 1),
      client.hincrby(METRICS_KEY, fld('period', meta.period), 1),
    ]);
    return;
  }

  // memory fallback
  mem.total += 1;
  mem.byAge.set(meta.age, (mem.byAge.get(meta.age) || 0) + 1);
  mem.byGenre.set(meta.genre, (mem.byGenre.get(meta.genre) || 0) + 1);
  mem.byLength.set(meta.length, (mem.byLength.get(meta.length) || 0) + 1);
  mem.byLevel.set(meta.level, (mem.byLevel.get(meta.level) || 0) + 1);
  mem.byPeriod.set(meta.period, (mem.byPeriod.get(meta.period) || 0) + 1);
}

export async function getStats(): Promise<Stats> {
  const client = redis;
  if (client) {
    const raw = (await client.hgetall(METRICS_KEY)) as Record<string, unknown> | null;
    const stats: Stats = {
      total: 0,
      byAge: {},
      byGenre: {},
      byLength: {},
      byLevel: {},
      byPeriod: {},
    };
    if (!raw) return stats;

    const toNum = (v: unknown) => {
      const n = typeof v === 'string' ? parseInt(v, 10) : (v as number);
      return Number.isFinite(n) ? n : 0;
    };

    for (const [k, v] of Object.entries(raw)) {
      if (k === 'total') {
        stats.total = toNum(v);
        continue;
      }
      const [scope, val] = k.split('::', 2);
      if (!scope || !val) continue;
      const n = toNum(v);
      switch (scope) {
        case 'age': stats.byAge[val] = n; break;
        case 'genre': stats.byGenre[val] = n; break;
        case 'length': stats.byLength[val] = n; break;
        case 'level': stats.byLevel[val] = n; break;
        case 'period': stats.byPeriod[val] = n; break;
      }
    }
    return stats;
  }

  // memory
  const objFrom = (m: Map<string, number>) => Object.fromEntries(Array.from(m.entries()));
  return {
    total: mem.total,
    byAge: objFrom(mem.byAge),
    byGenre: objFrom(mem.byGenre),
    byLength: objFrom(mem.byLength),
    byLevel: objFrom(mem.byLevel),
    byPeriod: objFrom(mem.byPeriod),
  };
}
