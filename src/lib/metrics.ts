import { redis } from "./kv";

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

export type DailyPoint = {
  date: string; // YYYY-MM-DD
  total: number;
  byAge: Record<string, number>;
  byGenre: Record<string, number>;
  byLength: Record<string, number>;
  byLevel: Record<string, number>;
  byPeriod: Record<string, number>;
};

const GLOBAL_KEY = "metrics:global";
const DAILY_PREFIX = "metrics:daily:"; // metrics:daily:YYYY-MM-DD

function fld(scope: string, value: string) {
  return `${scope}::${value}`;
}
function today(): string {
  return new Date().toISOString().slice(0, 10); // UTC yyyy-mm-dd
}

// memory fallback
const mem = {
  total: 0,
  byAge: new Map<string, number>(),
  byGenre: new Map<string, number>(),
  byLength: new Map<string, number>(),
  byLevel: new Map<string, number>(),
  byPeriod: new Map<string, number>(),
  daily: new Map<string, Stats>(), // date -> snapshot
};

function blankStats(): Stats {
  return { total: 0, byAge: {}, byGenre: {}, byLength: {}, byLevel: {}, byPeriod: {} };
}

export async function recordGeneration(meta: GenMeta) {
  const client = redis;
  const d = today();
  if (client) {
    await Promise.allSettled([
      // global
      client.hincrby(GLOBAL_KEY, "total", 1),
      client.hincrby(GLOBAL_KEY, fld("age", meta.age), 1),
      client.hincrby(GLOBAL_KEY, fld("genre", meta.genre), 1),
      client.hincrby(GLOBAL_KEY, fld("length", meta.length), 1),
      client.hincrby(GLOBAL_KEY, fld("level", meta.level), 1),
      client.hincrby(GLOBAL_KEY, fld("period", meta.period), 1),
      // daily
      client.hincrby(DAILY_PREFIX + d, "total", 1),
      client.hincrby(DAILY_PREFIX + d, fld("age", meta.age), 1),
      client.hincrby(DAILY_PREFIX + d, fld("genre", meta.genre), 1),
      client.hincrby(DAILY_PREFIX + d, fld("length", meta.length), 1),
      client.hincrby(DAILY_PREFIX + d, fld("level", meta.level), 1),
      client.hincrby(DAILY_PREFIX + d, fld("period", meta.period), 1),
    ]);
    return;
  }

  // memory fallback
  mem.total += 1;
  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) || 0) + 1);
  bump(mem.byAge, meta.age);
  bump(mem.byGenre, meta.genre);
  bump(mem.byLength, meta.length);
  bump(mem.byLevel, meta.level);
  bump(mem.byPeriod, meta.period);

  const ds = mem.daily.get(d) || blankStats();
  ds.total += 1;
  ds.byAge[meta.age] = (ds.byAge[meta.age] || 0) + 1;
  ds.byGenre[meta.genre] = (ds.byGenre[meta.genre] || 0) + 1;
  ds.byLength[meta.length] = (ds.byLength[meta.length] || 0) + 1;
  ds.byLevel[meta.level] = (ds.byLevel[meta.level] || 0) + 1;
  ds.byPeriod[meta.period] = (ds.byPeriod[meta.period] || 0) + 1;
  mem.daily.set(d, ds);
}

export async function getStats(): Promise<Stats> {
  const client = redis;
  if (client) {
    const raw = (await client.hgetall(GLOBAL_KEY)) as Record<string, unknown> | null;
    const stats = blankStats();
    if (!raw) return stats;
    const toNum = (v: unknown) => {
      const n = typeof v === "string" ? parseInt(v, 10) : (v as number);
      return Number.isFinite(n) ? n : 0;
    };
    for (const [k, v] of Object.entries(raw)) {
      if (k === "total") { stats.total = toNum(v); continue; }
      const [scope, val] = k.split("::", 2);
      if (!scope || !val) continue;
      const n = toNum(v);
      switch (scope) {
        case "age": stats.byAge[val] = n; break;
        case "genre": stats.byGenre[val] = n; break;
        case "length": stats.byLength[val] = n; break;
        case "level": stats.byLevel[val] = n; break;
        case "period": stats.byPeriod[val] = n; break;
      }
    }
    return stats;
  }
  const objFrom = (m: Map<string, number>) => Object.fromEntries([...m.entries()]);
  return { total: mem.total, byAge: objFrom(mem.byAge), byGenre: objFrom(mem.byGenre), byLength: objFrom(mem.byLength), byLevel: objFrom(mem.byLevel), byPeriod: objFrom(mem.byPeriod) };
}

export async function getDailyStats(days: number): Promise<DailyPoint[]> {
  const n = Math.max(1, Math.min(days, 365));
  const dates: string[] = [];
  const todayDate = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(todayDate.getUTCFullYear(), todayDate.getUTCMonth(), todayDate.getUTCDate()));
    d.setUTCDate(d.getUTCDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }

  const client = redis;
  if (client) {
    const res = await Promise.all(dates.map(async (d) => {
      const raw = (await client.hgetall(DAILY_PREFIX + d)) as Record<string, unknown> | null;
      const base: DailyPoint = { date: d, total: 0, byAge: {}, byGenre: {}, byLength: {}, byLevel: {}, byPeriod: {} };
      if (!raw) return base;
      const toNum = (v: unknown) => {
        const n = typeof v === "string" ? parseInt(v, 10) : (v as number);
        return Number.isFinite(n) ? n : 0;
      };
      for (const [k, v] of Object.entries(raw)) {
        if (k === "total") { base.total = toNum(v); continue; }
        const [scope, val] = k.split("::", 2);
        if (!scope || !val) continue;
        const n = toNum(v);
        switch (scope) {
          case "age": base.byAge[val] = n; break;
          case "genre": base.byGenre[val] = n; break;
          case "length": base.byLength[val] = n; break;
          case "level": base.byLevel[val] = n; break;
          case "period": base.byPeriod[val] = n; break;
        }
      }
      return base;
    }));
    return res;
  }

  // memory
  return dates.map(d => {
    const s = mem.daily.get(d) || blankStats();
    return { date: d, ...s };
  });
}
