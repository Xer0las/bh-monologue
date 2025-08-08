'use client';
import React, { useEffect, useState } from 'react';

type Stats = {
  ok: boolean;
  startedAt: string;
  uptimeSec: number;
  counts: { pageview: number; generate_clicked: number };
  recent: Array<{ ts: string; event: string; ip: string; data?: Record<string, unknown> }>;
};

export default function AdminPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function loadStats() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch('/api/metrics?stats=1', { cache: 'no-store' });
      const json = (await res.json()) as Stats;
      setStats(json);
    } catch (e: any) {
      setErr(e?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStats();
    const id = setInterval(loadStats, 10_000); // refresh every 10s
    return () => clearInterval(id);
  }, []);

  const since = stats?.startedAt
    ? new Date(stats.startedAt).toLocaleString()
    : '—';
  const uptime = stats ? fmtDuration(stats.uptimeSec) : '—';

  return (
    <main className="min-h-screen max-w-5xl mx-auto p-6">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Admin · BH Monologues</h1>
        <div className="flex gap-2">
          <a href="/" className="h-10 px-3 rounded-lg border flex items-center">← Back</a>
          <button onClick={loadStats} className="h-10 px-3 rounded-lg border" disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </header>

      {err && <p className="mt-3 text-sm text-red-600">Error: {err}</p>}

      <section className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard label="Pageviews (since boot)" value={stats?.counts.pageview ?? 0} />
        <StatCard label="Generates (since boot)" value={stats?.counts.generate_clicked ?? 0} />
        <StatCard label="Uptime" value={uptime} sub={since} />
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Recent Events</h2>
        {!stats?.recent?.length && <p className="text-sm text-neutral-600 mt-1">No events yet.</p>}
        <ul className="mt-3 grid gap-2">
          {stats?.recent?.map((r, i) => (
            <li key={i} className="border rounded-lg p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{r.event}</span>
                <span className="text-neutral-600">· {new Date(r.ts).toLocaleString()}</span>
                <span className="text-neutral-600">· {r.ip || 'ip?'} </span>
              </div>
              {r.data && (
                <pre className="mt-1 text-xs whitespace-pre-wrap">
{JSON.stringify(r.data, null, 2)}
                </pre>
              )}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function StatCard({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="border rounded-lg p-4">
      <div className="text-xs uppercase tracking-wide text-neutral-600">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {sub ? <div className="text-xs text-neutral-600 mt-0.5">{sub}</div> : null}
    </div>
  );
}

function fmtDuration(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const parts = [];
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}
