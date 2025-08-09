'use client';
import { useEffect, useState } from 'react';

type OverrideRow = { ip: string; remaining: number; expiresInSeconds: number };
type CouponRow = { code: string; minutes: number; uses: number };
type Status = {
  storage: 'redis' | 'memory';
  redis: { present: boolean; connected: boolean; error?: string | null };
  env: { url: boolean; token: boolean };
  couponsCount?: number | null;
};
type Defaults = { defaultMinutes: number; defaultUses: number };
type Stats = {
  total: number;
  byAge: Record<string, number>;
  byGenre: Record<string, number>;
  byLength: Record<string, number>;
  byLevel: Record<string, number>;
  byPeriod: Record<string, number>;
};

export default function AdminManagePage() {
  const [key, setKey] = useState<string>('');
  const [stored, setStored] = useState<string>('');
  const [overrides, setOverrides] = useState<OverrideRow[]>([]);
  const [coupons, setCoupons] = useState<CouponRow[]>([]);
  const [form, setForm] = useState<CouponRow>({ code: '', minutes: 60, uses: 10 });
  const [err, setErr] = useState<string>('');
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(false);
  const [debugDump, setDebugDump] = useState<any | null>(null);
  const [defaults, setDefaults] = useState<Defaults>({ defaultMinutes: 10080, defaultUses: 100 });
  const [stats, setStats] = useState<Stats | null>(null);
  const [busyBtn, setBusyBtn] = useState<string>('');

  useEffect(() => {
    const k = localStorage.getItem('adminKey') || '';
    setKey(k);
    setStored(k);
    if (k) refreshAll(k);
  }, []);

  function saveKey() {
    localStorage.setItem('adminKey', key);
    setStored(key);
    refreshAll(key);
  }

  async function refreshAll(k: string) {
    setErr('');
    setLoading(true);
    try {
      const [st, ov, cp, df, stt] = await Promise.all([
        fetch('/api/admin/diag', { headers: { 'x-admin-key': k }, cache: 'no-store' }),
        fetch('/api/admin/overrides', { headers: { 'x-admin-key': k }, cache: 'no-store' }),
        fetch('/api/admin/coupons', { headers: { 'x-admin-key': k }, cache: 'no-store' }),
        fetch('/api/admin/settings', { headers: { 'x-admin-key': k }, cache: 'no-store' }),
        fetch('/api/admin/stats', { headers: { 'x-admin-key': k }, cache: 'no-store' }),
      ]);
      if ([st, ov, cp, df, stt].some(r => r.status === 401)) {
        setErr('Unauthorized – check admin key.');
        setOverrides([]); setCoupons([]); setStatus(null); setStats(null);
      } else {
        const stj = await st.json();
        const ovj = await ov.json();
        const cpj = await cp.json();
        const dfj = await df.json();
        const sttj = await stt.json();
        setStatus(stj || null);
        setOverrides(ovj.overrides || []);
        setCoupons(cpj.coupons || []);
        if (dfj?.defaults) setDefaults(dfj.defaults);
        if (sttj?.stats) setStats(sttj.stats);
        setForm(f => f.code ? f : { code: '', minutes: dfj?.defaults?.defaultMinutes ?? 60, uses: dfj?.defaults?.defaultUses ?? 10 });
      }
    } catch (e: any) {
      setErr(e?.message || 'Network error');
    } finally {
      setLoading(false);
    }
  }

  async function debugCoupons() {
    setBusyBtn('debug'); setDebugDump(null);
    const res = await fetch('/api/admin/coupons/debug', { headers: { 'x-admin-key': stored }, cache: 'no-store' });
    const j = await res.json().catch(()=>null);
    setDebugDump(j);
    setBusyBtn('');
  }

  async function repairCoupons() {
    setBusyBtn('repair'); setDebugDump(null);
    const res = await fetch('/api/admin/coupons/repair', { method: 'POST', headers: { 'x-admin-key': stored }, cache: 'no-store' });
    const j = await res.json().catch(()=>null);
    setDebugDump(j);
    setBusyBtn('');
    await refreshAll(stored);
  }

  async function releaseIp(ip: string) {
    setBusyBtn(`rel-${ip}`);
    await fetch(`/api/admin/overrides?ip=${encodeURIComponent(ip)}`, {
      method: 'DELETE',
      headers: { 'x-admin-key': stored },
      cache: 'no-store',
    });
    setBusyBtn('');
    refreshAll(stored);
  }

  async function createOrUpdateCoupon(e: React.FormEvent) {
    e.preventDefault();
    setBusyBtn('saveCoupon');
    const res = await fetch('/api/admin/coupons', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-key': stored },
      body: JSON.stringify(form),
      cache: 'no-store',
    });
    const j = await res.json().catch(() => ({}));
    setBusyBtn('');
    if (res.ok) {
      setForm({ code: '', minutes: defaults.defaultMinutes, uses: defaults.defaultUses });
      await refreshAll(stored);
    } else {
      setErr(j?.error || 'Failed to save coupon');
    }
  }

  async function deleteCoupon(code: string) {
    if (!confirm(`Delete coupon "${code}"?`)) return;
    setBusyBtn(`del-${code}`);
    await fetch(`/api/admin/coupons?code=${encodeURIComponent(code)}`, {
      method: 'DELETE',
      headers: { 'x-admin-key': stored },
      cache: 'no-store',
    });
    setBusyBtn('');
    await refreshAll(stored);
  }

  async function saveDefaults(e: React.FormEvent) {
    e.preventDefault();
    setBusyBtn('saveDefaults');
    const res = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-key': stored },
      body: JSON.stringify(defaults),
      cache: 'no-store',
    });
    const j = await res.json().catch(()=>({}));
    setBusyBtn('');
    if (res.ok && j?.defaults) {
      setDefaults(j.defaults);
      setForm(f => f.code ? f : { code: '', minutes: j.defaults.defaultMinutes, uses: j.defaults.defaultUses });
    } else {
      alert(j?.error || 'Failed to save defaults');
    }
  }

  function editCoupon(c: CouponRow) {
    setForm({ code: c.code, minutes: c.minutes, uses: c.uses });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function applyDefaultsToForm() {
    setForm(f => ({ code: f.code, minutes: defaults.defaultMinutes, uses: defaults.defaultUses }));
  }

  async function applyDefaultsToCode(code: string) {
    setBusyBtn(`apply-${code}`);
    const res = await fetch('/api/admin/coupons', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-key': stored },
      body: JSON.stringify({ code, minutes: defaults.defaultMinutes, uses: defaults.defaultUses }),
      cache: 'no-store',
    });
    setBusyBtn('');
    if (res.ok) await refreshAll(stored);
  }

  function Card(props: { title: string; children: any }) {
    return (
      <section className="bg-white rounded-xl border shadow-sm p-5">
        <h2 className="text-lg font-semibold mb-3">{props.title}</h2>
        {props.children}
      </section>
    );
  }

  function Btn({ children, onClick, kind='default', id }:{
    children: any; onClick?: ()=>void; kind?: 'default'|'primary'|'danger'|'ghost'; id?: string;
  }) {
    const base = 'inline-flex items-center h-9 px-3 rounded-lg border text-sm transition active:scale-[.98]';
    const cls =
      kind === 'primary' ? `${base} bg-black text-white border-black hover:bg-neutral-800`
      : kind === 'danger' ? `${base} bg-red-600 text-white border-red-600 hover:bg-red-700`
      : kind === 'ghost' ? `${base} bg-transparent hover:bg-neutral-50`
      : `${base} bg-white hover:bg-neutral-50`;
    const spinning = busyBtn === id;
    return (
      <button onClick={onClick} className={`${cls} ${spinning ? 'opacity-60 cursor-wait' : ''}`} disabled={spinning}>
        {spinning ? 'Working…' : children}
      </button>
    );
  }

  function StatTable({ title, data }:{ title: string; data: Record<string, number> }) {
    const entries = Object.entries(data || {}).sort((a,b)=>b[1]-a[1]);
    if (!entries.length) return null;
    return (
      <div>
        <h4 className="font-medium mt-4 mb-2">{title}</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-neutral-600">
                <th className="py-1 pr-2">Value</th>
                <th className="py-1 text-right">Count</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(([k,v])=>(
                <tr key={k} className="border-t">
                  <td className="py-1 pr-2">{k}</td>
                  <td className="py-1 text-right tabular-nums">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">Admin Tools</h1>

      {/* Admin Key */}
      <Card title="Admin Key">
        <div className="flex items-center gap-3 flex-wrap">
          <label htmlFor="admin-key" className="text-sm">Key</label>
          <input
            id="admin-key"
            name="adminKey"
            type="password"
            placeholder="Enter admin key"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            autoComplete="off"
            className="h-9 px-3 rounded-lg border w-80"
          />
          <Btn onClick={saveKey} kind="primary">Use Key</Btn>
          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>
      </Card>

      {/* Status */}
      <Card title="Status">
        {!status && <p className="text-sm text-neutral-600">—</p>}
        {status && (
          <div className="font-mono text-sm">
            <div>Storage: <span className="font-semibold">{status.storage}</span></div>
            <div>ENV URL: {status.env.url ? 'set' : 'missing'} | ENV TOKEN: {status.env.token ? 'set' : 'missing'}</div>
            <div>Redis Connected: {status.redis.connected ? 'yes' : (status.redis.present ? 'no' : 'n/a')}</div>
            {typeof status.couponsCount === 'number' && (
              <div>Coupon keys: {status.couponsCount}</div>
            )}
          </div>
        )}
        <div className="mt-3 flex gap-2 flex-wrap">
          <Btn onClick={() => refreshAll(stored)} id="refresh">Refresh</Btn>
          <Btn onClick={debugCoupons} id="debug">Debug: Log coupon keys</Btn>
          <Btn onClick={repairCoupons} id="repair">Repair coupon keys</Btn>
        </div>
        {debugDump && (
          <pre className="mt-3 text-xs bg-neutral-50 border rounded-lg p-3 max-h-80 overflow-auto">
            {JSON.stringify(debugDump, null, 2)}
          </pre>
        )}
      </Card>

      {/* Global Defaults */}
      <Card title="Global Defaults (for new coupons)">
        <form onSubmit={saveDefaults} className="flex items-center gap-3 flex-wrap">
          <label htmlFor="default-mins" className="text-sm">Default minutes</label>
          <input
            id="default-mins"
            name="defaultMinutes"
            type="number"
            value={defaults.defaultMinutes}
            onChange={(e) => setDefaults({ ...defaults, defaultMinutes: Number(e.target.value) })}
            className="h-9 px-3 rounded-lg border w-40"
            inputMode="numeric"
          />
          <label htmlFor="default-uses" className="text-sm">Default uses</label>
          <input
            id="default-uses"
            name="defaultUses"
            type="number"
            value={defaults.defaultUses}
            onChange={(e) => setDefaults({ ...defaults, defaultUses: Number(e.target.value) })}
            className="h-9 px-3 rounded-lg border w-36"
            inputMode="numeric"
          />
          <Btn kind="primary" id="saveDefaults">Save defaults</Btn>
          <Btn onClick={applyDefaultsToForm}>Use defaults in form</Btn>
          <Btn onClick={() => applyDefaultsToCode('chickenpotpie')} id="apply-chicken">Apply defaults to “chickenpotpie”</Btn>
        </form>
        <p className="text-xs text-neutral-600 mt-2">
          These values are used as the starting values when creating coupons. You can also apply them to the
          “chickenpotpie” code with one click.
        </p>
      </Card>

      {/* Create / Edit Coupon */}
      <Card title="Create / Edit Coupon">
        <form onSubmit={createOrUpdateCoupon} className="flex items-center gap-3 flex-wrap">
          <label htmlFor="coupon-code" className="text-sm">Code</label>
          <input
            id="coupon-code"
            name="code"
            placeholder="code (e.g., chickenpotpie)"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
            required
            className="h-9 px-3 rounded-lg border w-60"
            autoComplete="off"
          />
          <label htmlFor="coupon-minutes" className="text-sm">Minutes</label>
          <input
            id="coupon-minutes"
            name="minutes"
            type="number"
            placeholder="minutes"
            value={form.minutes}
            onChange={(e) => setForm({ ...form, minutes: Number(e.target.value) })}
            required
            className="h-9 px-3 rounded-lg border w-36"
            inputMode="numeric"
          />
          <label htmlFor="coupon-uses" className="text-sm">Uses</label>
          <input
            id="coupon-uses"
            name="uses"
            type="number"
            placeholder="uses"
            value={form.uses}
            onChange={(e) => setForm({ ...form, uses: Number(e.target.value) })}
            required
            className="h-9 px-3 rounded-lg border w-32"
            inputMode="numeric"
          />
          <Btn kind="primary" id="saveCoupon">{form.code ? 'Save Coupon' : 'Create Coupon'}</Btn>
          {form.code && <Btn onClick={() => setForm({ code: '', minutes: defaults.defaultMinutes, uses: defaults.defaultUses })}>Clear</Btn>}
        </form>

        <h3 className="mt-4 font-semibold">Existing Coupons</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-neutral-600">
                <th className="py-1 pr-2">Code</th>
                <th className="py-1 text-right">Minutes</th>
                <th className="py-1 text-right">Uses</th>
                <th className="py-1 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {coupons.map((c) => (
                <tr key={c.code} className="border-t">
                  <td className="py-1 pr-2"><code>{c.code}</code></td>
                  <td className="py-1 text-right tabular-nums">{c.minutes}</td>
                  <td className="py-1 text-right tabular-nums">{c.uses}</td>
                  <td className="py-1 text-right">
                    <Btn onClick={() => editCoupon(c)} id={`edit-${c.code}`}>Edit</Btn>
                    <span className="inline-block w-2" />
                    <Btn onClick={() => deleteCoupon(c.code)} kind="danger" id={`del-${c.code}`}>Delete</Btn>
                  </td>
                </tr>
              ))}
              {!coupons.length && (
                <tr><td colSpan={4} className="py-2 text-neutral-500">No coupons yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Overrides */}
      <Card title="Overrides">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-neutral-600">
                <th className="py-1 pr-2">IP</th>
                <th className="py-1 text-right">Remaining</th>
                <th className="py-1 text-right">Expires (sec)</th>
                <th className="py-1 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {overrides.map((o) => (
                <tr key={o.ip} className="border-t">
                  <td className="py-1 pr-2">{o.ip}</td>
                  <td className="py-1 text-right tabular-nums">{o.remaining}</td>
                  <td className="py-1 text-right tabular-nums">{o.expiresInSeconds}</td>
                  <td className="py-1 text-right">
                    <Btn onClick={() => releaseIp(o.ip)} id={`rel-${o.ip}`}>Release</Btn>
                  </td>
                </tr>
              ))}
              {!overrides.length && (
                <tr><td colSpan={4} className="py-2 text-neutral-500">No active overrides</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Stats */}
      <Card title="Usage Stats">
        {!stats && <p className="text-sm text-neutral-600">No stats yet.</p>}
        {stats && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-2">
              <div className="rounded-lg border p-3">
                <div className="text-xs text-neutral-600">Total generations</div>
                <div className="text-2xl font-semibold tabular-nums">{stats.total}</div>
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              <StatTable title="By Age" data={stats.byAge} />
              <StatTable title="By Genre" data={stats.byGenre} />
              <StatTable title="By Length" data={stats.byLength} />
              <StatTable title="By Level" data={stats.byLevel} />
              <StatTable title="By Period" data={stats.byPeriod} />
            </div>
          </>
        )}
        <div className="mt-3">
          <Btn onClick={() => refreshAll(stored)}>Refresh stats</Btn>
        </div>
      </Card>
    </div>
  );
}
