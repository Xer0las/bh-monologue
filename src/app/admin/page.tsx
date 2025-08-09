'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';

type Defaults = {
  defaultMinutes: number;
  defaultUses: number;
};

type AdminInfo = {
  pageviews: number;
  generations: number;
  uptime: string;
  now: string;
};

export default function AdminPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [defaults, setDefaults] = useState<Defaults>({
    defaultMinutes: 15,
    defaultUses: 3,
  });

  // Optional: simple counters/uptime if your API provides these elsewhere later.
  const [info, setInfo] = useState<AdminInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Get current global defaults
      const r = await fetch('/api/admin/settings', { cache: 'no-store' });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j?.error || `Settings load failed (${r.status})`);
      }
      const j = await r.json();
      if (j?.defaults) {
        setDefaults({
          defaultMinutes: Number(j.defaults.defaultMinutes ?? 15),
          defaultUses: Number(j.defaults.defaultUses ?? 3),
        });
      }

      // If you later expose metrics, load them here. For now just fake uptime since boot.
      setInfo((prev) => prev ?? null);
    } catch (e: any) {
      setError(e?.message || 'Failed to load admin data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSavedMsg(null);
    try {
      const r = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          defaultMinutes: Number(defaults.defaultMinutes),
          defaultUses: Number(defaults.defaultUses),
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j?.error || `Save failed (${r.status})`);
      }
      const j = await r.json();
      if (j?.defaults) {
        setDefaults({
          defaultMinutes: Number(j.defaults.defaultMinutes ?? defaults.defaultMinutes),
          defaultUses: Number(j.defaults.defaultUses ?? defaults.defaultUses),
        });
      }
      setSavedMsg('Saved.');
    } catch (e: any) {
      setError(e?.message || 'Failed to save defaults.');
    } finally {
      setSaving(false);
      // Hide “Saved.” after a moment
      setTimeout(() => setSavedMsg(null), 2000);
    }
  }

  function setNumber<K extends keyof Defaults>(key: K, value: string) {
    // guard NaN; keep empty string to allow typing
    const n = value.trim() === '' ? NaN : Number(value);
    setDefaults((d) => ({
      ...d,
      [key]: Number.isFinite(n) ? n : (value.trim() === '' ? ('' as unknown as number) : d[key]),
    }));
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex items-center gap-4">
        <h1 className="text-3xl font-semibold">Admin · BH Monologues</h1>
        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/"
            className="rounded border px-3 py-1 text-sm hover:bg-gray-50"
          >
            ← Back
          </Link>
          <button
            onClick={load}
            className="rounded border px-3 py-1 text-sm hover:bg-gray-50"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Cards row (pageviews/generates/uptime). If you don’t have data yet, these show zeros.) */}
      <section className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded border p-4">
          <div className="text-sm text-gray-500">PAGEVIEWS (SINCE BOOT)</div>
          <div className="mt-2 text-3xl font-bold">{info?.pageviews ?? 0}</div>
        </div>
        <div className="rounded border p-4">
          <div className="text-sm text-gray-500">GENERATES (SINCE BOOT)</div>
          <div className="mt-2 text-3xl font-bold">{info?.generations ?? 0}</div>
        </div>
        <div className="rounded border p-4">
          <div className="text-sm text-gray-500">UPTIME</div>
          <div className="mt-2 text-3xl font-bold">{info?.uptime ?? '—'}</div>
          <div className="text-xs text-gray-500">{info?.now ?? ''}</div>
        </div>
      </section>

      {/* Global Defaults */}
      <section className="rounded border p-4">
        <h2 className="mb-3 text-xl font-semibold">Global Defaults</h2>
        <p className="mb-4 text-sm text-gray-600">
          These defaults control the global generation limits for anyone using the app.
          They are <strong>not</strong> tied to coupons.
        </p>

        <form onSubmit={onSave} className="flex flex-col gap-4 max-w-md">
          <label className="flex flex-col gap-1">
            <span className="text-sm text-gray-700">Default minutes (window)</span>
            <input
              type="number"
              min={1}
              step={1}
              value={Number.isFinite(defaults.defaultMinutes) ? String(defaults.defaultMinutes) : ''}
              onChange={(e) => setNumber('defaultMinutes', e.target.value)}
              className="w-48 rounded border px-2 py-1"
              placeholder="e.g., 15"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm text-gray-700">Default uses (max)</span>
            <input
              type="number"
              min={1}
              step={1}
              value={Number.isFinite(defaults.defaultUses) ? String(defaults.defaultUses) : ''}
              onChange={(e) => setNumber('defaultUses', e.target.value)}
              className="w-48 rounded border px-2 py-1"
              placeholder="e.g., 3"
            />
          </label>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded bg-black px-3 py-1 text-white disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save defaults'}
            </button>
            {loading && <span className="text-sm text-gray-500">Loading…</span>}
            {savedMsg && <span className="text-sm text-green-700">{savedMsg}</span>}
            {error && <span className="text-sm text-red-700">{error}</span>}
          </div>
        </form>
      </section>

      {/* Recent events placeholder, to be wired later */}
      <section className="mt-10">
        <h3 className="mb-2 text-lg font-medium">Recent Events</h3>
        <div className="rounded border p-4 text-sm text-gray-600">No events yet.</div>
      </section>
    </main>
  );
}
