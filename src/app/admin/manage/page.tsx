'use client';
import { useEffect, useMemo, useRef, useState } from 'react';

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
type DailyPoint = {
  date: string; // YYYY-MM-DD (UTC)
  total: number;
  byAge: Record<string, number>;
  byGenre: Record<string, number>;
  byLength: Record<string, number>;
  byLevel: Record<string, number>;
  byPeriod: Record<string, number>;
};
type DailyResp = { days: number; points: DailyPoint[] };

const AGE_KEYS = ['Kids 7–10','Tweens 11–13','Teens 14–17','Adults 18+'] as const;
const GENRE_KEYS = ['Comedy','Drama','Fantasy / Sci-Fi','Classic (heightened)'] as const;

// Colors for stacked segments (keep it simple & readable)
const AGE_COLORS: Record<string, string> = {
  'Kids 7–10': 'bg-emerald-600',
  'Tweens 11–13': 'bg-sky-600',
  'Teens 14–17': 'bg-amber-600',
  'Adults 18+': 'bg-fuchsia-600',
};
const GENRE_COLORS: Record<string, string> = {
  'Comedy': 'bg-yellow-500',
  'Drama': 'bg-red-600',
  'Fantasy / Sci-Fi': 'bg-indigo-600',
  'Classic (heightened)': 'bg-teal-600',
};

export default function AdminManagePage() {
  const [key, setKey] = useState<string>('');
  const [stored, setStored] = useState<string>('');
  const [overrides, setOverrides] = useState<OverrideRow[]>([]);
  const [coupons, setCoupons] = useState<CouponRow[]>([]);
  const [err, setErr] = useState<string>('');
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(false);
  const [debugDump, setDebugDump] = useState<any | null>(null);

  // Saved (authoritative) defaults from the server
  const [defaults, setDefaults] = useState<Defaults>({ defaultMinutes: 10080, defaultUses: 100 });

  const [stats, setStats] = useState<Stats | null>(null);
  const [daily, setDaily] = useState<DailyResp | null>(null);
  const [busyBtn, setBusyBtn] = useState<string>('');
  const [grant, setGrant] = useState<{ ip: string; minutes: number; uses: number }>({ ip: '', minutes: 10080, uses: 100 });

  // chart controls
  const [dailyRange, setDailyRange] = useState<number>(30);
  const [stackMode, setStackMode] = useState<'age'|'genre'>('age');

  // ---------- Refs for UNCONTROLLED inputs (no blur on re-render) ----------
  // Global defaults refs
  const minsRef = useRef<HTMLInputElement>(null);
  const usesRef = useRef<HTMLInputElement>(null);

  // Coupon form refs
  const codeRef = useRef<HTMLInputElement>(null);
  const cMinsRef = useRef<HTMLInputElement>(null);
  const cUsesRef = useRef<HTMLInputElement>(null);

  // Bootstrap key
  useEffect(() => {
    const k = localStorage.getItem('adminKey') || '';
    setKey(k);
    setStored(k);
    if (k) refreshAll(k, dailyRange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function signOut() {
    localStorage.removeItem('adminKey');
    setStored('');
    setKey('');
    setStatus(null);
    setOverrides([]);
    setCoupons([]);
    setStats(null);
    setDaily(null);
  }

  async function signIn() {
    localStorage.setItem('adminKey', key);
    setStored(key);
    await refreshAll(key, dailyRange);
  }

  async function refreshAll(k: string, range: number) {
    if (!k) return;
    setErr('');
    setLoading(true);
    try {
      const [st, ov, cp, df, stt, dly] = await Promise.all([
        fetch('/api/admin/diag', { headers: { 'x-admin-key': k }, cache: 'no-store' }),
        fetch('/api/admin/overrides', { headers: { 'x-admin-key': k }, cache: 'no-store' }),
        fetch('/api/admin/coupons', { headers: { 'x-admin-key': k }, cache: 'no-store' }),
        fetch('/api/admin/settings', { headers: { 'x-admin-key': k }, cache: 'no-store' }),
        fetch('/api/admin/stats', { headers: { 'x-admin-key': k }, cache: 'no-store' }),
        fetch(`/api/admin/stats/daily?days=${range}`, { headers: { 'x-admin-key': k }, cache: 'no-store' }),
      ]);
      if ([st, ov, cp, df, stt, dly].some(r => r.status === 401)) {
        setErr('Unauthorized – check admin key.');
        setOverrides([]); setCoupons([]); setStatus(null); setStats(null); setDaily(null);
      } else {
        const stj = await st.json();
        const ovj = await ov.json();
        const cpj = await cp.json();
        const dfj = await df.json();
        const sttj = await stt.json();
        const dlj = await dly.json();
        setStatus(stj || null);
        setOverrides(ovj.overrides || []);
        setCoupons(cpj.coupons || []);
        if (dfj?.defaults) {
          setDefaults(dfj.defaults);
          // Sync UNCONTROLLED inputs manually so they display current values
          if (minsRef.current) minsRef.current.value = String(dfj.defaults.defaultMinutes ?? '');
          if (usesRef.current) usesRef.current.value = String(dfj.defaults.defaultUses ?? '');
          // Also prime coupon form with current defaults
          if (cMinsRef.current && !cMinsRef.current.value) cMinsRef.current.value = String(dfj.defaults.defaultMinutes ?? '');
          if (cUsesRef.current && !cUsesRef.current.value) cUsesRef.current.value = String(dfj.defaults.defaultUses ?? '');
        }
        if (sttj?.stats) setStats(sttj.stats);
        if (dlj?.points) setDaily(dlj);
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
    await refreshAll(stored, dailyRange);
  }

  async function releaseIp(ip: string) {
    setBusyBtn(`rel-${ip}`);
    await fetch(`/api/admin/overrides?ip=${encodeURIComponent(ip)}`, {
      method: 'DELETE',
      headers: { 'x-admin-key': stored },
      cache: 'no-store',
    });
    setBusyBtn('');
    refreshAll(stored, dailyRange);
  }

  async function grantIp() {
    if (!grant.ip) { alert('Enter an IP'); return; }
    setBusyBtn('grant');
    const res = await fetch('/api/admin/overrides', {
      method: 'POST',
      headers: { 'x-admin-key': stored, 'content-type': 'application/json' },
      body: JSON.stringify(grant),
      cache: 'no-store',
    });
    setBusyBtn('');
    if (!res.ok) {
      const j = await res.json().catch(()=>({}));
      alert(j?.error || 'Failed to grant.');
    }
    await refreshAll(stored, dailyRange);
  }

  // --------- Coupon form handlers (read from refs on submit) ---------
  function clearCouponForm() {
    if (codeRef.current) codeRef.current.value = '';
    if (cMinsRef.current) cMinsRef.current.value = String(defaults.defaultMinutes);
    if (cUsesRef.current) cUsesRef.current.value = String(defaults.defaultUses);
  }

  async function createOrUpdateCoupon(e: React.FormEvent) {
    e.preventDefault();
    setBusyBtn('saveCoupon');

    const code = codeRef.current?.value?.trim() || '';
    const minutes = parseInt(cMinsRef.current?.value || '', 10);
    const uses = parseInt(cUsesRef.current?.value || '', 10);

    if (!code) { setBusyBtn(''); alert('Please enter a code.'); return; }
    if (!Number.isFinite(minutes) || minutes < 0) { setBusyBtn(''); alert('Minutes must be a non-negative number.'); return; }
    if (!Number.isFinite(uses) || uses < 0) { setBusyBtn(''); alert('Uses must be a non-negative number.'); return; }

    const res = await fetch('/api/admin/coupons', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-key': stored },
      body: JSON.stringify({ code, minutes, uses }),
      cache: 'no-store',
    });

    setBusyBtn('');
    if (res.ok) {
      clearCouponForm();
      await refreshAll(stored, dailyRange);
    } else {
      const j = await res.json().catch(() => ({}));
      setErr(j?.error || 'Failed to save coupon');
    }
  }

  function editCoupon(c: CouponRow) {
    if (codeRef.current) codeRef.current.value = c.code;
    if (cMinsRef.current) cMinsRef.current.value = String(c.minutes);
    if (cUsesRef.current) cUsesRef.current.value = String(c.uses);
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
    await refreshAll(stored, dailyRange);
  }

  // --------- Save defaults (read from refs; no controlled state => no blur) ---------
  async function saveDefaults(e: React.FormEvent) {
    e.preventDefault();
    setBusyBtn('saveDefaults');

    const minutes = parseInt(minsRef.current?.value || '', 10);
    const uses = parseInt(usesRef.current?.value || '', 10);

    if (!Number.isFinite(minutes) || minutes < 0 || !Number.isFinite(uses) || uses < 0) {
      setBusyBtn('');
      alert('Please enter valid non-negative numbers for minutes and uses.');
      return;
    }

    const res = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-key': stored },
      body: JSON.stringify({ defaultMinutes: minutes, defaultUses: uses }),
      cache: 'no-store',
    });

    const j = await res.json().catch(()=>({}));
    setBusyBtn('');

    if (res.ok && j?.defaults) {
      setDefaults(j.defaults);
      // ensure inputs reflect what the server saved
      if (minsRef.current) minsRef.current.value = String(j.defaults.defaultMinutes);
      if (usesRef.current) usesRef.current.value = String(j.defaults.defaultUses);
      // also refresh coupons list etc
      await refreshAll(stored, dailyRange);
    } else {
      alert(j?.error || 'Failed to save defaults');
    }
  }

  async function downloadCsv(url: string, filename: string) {
    const res = await fetch(url, { headers: { 'x-admin-key': stored }, cache: 'no-store' });
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }

  // UI bits
  function Card(props: { title: string; children: any; right?: any }) {
    return (
      <section className="bg-white rounded-xl border shadow-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">{props.title}</h2>
          {props.right}
        </div>
        {props.children}
      </section>
    );
  }

  function Btn({ children, onClick, kind='default', id, type }:{
    children: any; onClick?: ()=>void; kind?: 'default'|'primary'|'danger'|'ghost'; id?: string; type?: 'button'|'submit';
  }) {
    const base = 'inline-flex items-center h-9 px-3 rounded-lg border text-sm transition active:scale-[.98]';
    const cls =
      kind === 'primary' ? `${base} bg-black text-white border-black hover:bg-neutral-800`
      : kind === 'danger' ? `${base} bg-red-600 text-white border-red-600 hover:bg-red-700`
      : kind === 'ghost' ? `${base} bg-transparent hover:bg-neutral-50`
      : `${base} bg-white hover:bg-neutral-50`;
    const spinning = busyBtn === id;
    return (
      <button type={type || 'button'} onClick={onClick} className={`${cls} ${spinning ? 'opacity-60 cursor-wait' : ''}`} disabled={spinning}>
        {spinning ? 'Working…' : children}
      </button>
    );
  }

  // --- Stacked chart ---
  function Legend({ items, colors }:{ items: string[]; colors: Record<string,string> }) {
    return (
      <div className="flex flex-wrap gap-3 text-xs">
        {items.map(k => (
          <div key={k} className="flex items-center gap-1">
            <span className={`inline-block w-3 h-3 rounded ${colors[k] || 'bg-neutral-400'}`} />
            <span>{k}</span>
          </div>
        ))}
      </div>
    );
  }

  function StackedChart({
    points, keys, colors,
  }:{
    points: DailyPoint[]; keys: string[]; colors: Record<string,string>;
  }) {
    const max = useMemo(()=> Math.max(1, ...points.map(p=>p.total)), [points]);
    return (
      <div className="flex items-end gap-1 h-40">
        {points.map(p => {
          const barPct = (p.total / max) * 100;
          const barStyles = { height: `${barPct}%` };

          const segs = keys.map(k => {
            const scope = stackMode === 'age' ? p.byAge : p.byGenre;
            const value = scope?.[k] || 0;
            const frac = p.total > 0 ? value / p.total : 0;
            return { key: k, pct: frac * 100, value };
          }).filter(s => s.value > 0);

          return (
            <div key={p.date} className="flex-1 flex items-end">
              <div className="w-full rounded-t overflow-hidden" style={barStyles} title={`${p.date}: ${p.total}`}>
                {/* Base bar so totals are visible even if segments are 0 */}
                <div className="w-full h-full bg-neutral-200">
                  {/* segment stack (top-to-bottom) */}
                  <div className="w-full h-full flex flex-col-reverse">
                    {segs.map(s => (
                      <div
                        key={s.key}
                        className={`${colors[s.key] || 'bg-neutral-400'}`}
                        style={{ height: `${s.pct}%` }}
                        title={`${p.date} • ${s.key}: ${s.value}`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // Sign-in gate
  if (!stored) {
    return (
      <div className="min-h-screen grid place-items-center p-6">
        <div className="w-full max-w-md bg-white rounded-xl border shadow-sm p-6 space-y-4">
          <h1 className="text-xl font-semibold">Admin Sign-in</h1>
          <label className="grid gap-1 text-sm">
            <span>Admin key</span>
            <input type="password" className="h-10 px-3 rounded-lg border" value={key} onChange={e=>setKey(e.target.value)} />
          </label>
          <div className="flex gap-2">
            <Btn onClick={signIn} kind="primary">Sign in</Btn>
          </div>
          {err && <div className="text-sm text-red-600">{err}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Admin Tools</h1>
        <Btn onClick={signOut}>Sign out</Btn>
      </div>

      {/* Status */}
      <Card
        title="Status"
        right={
          <div className="flex items-center gap-2">
            <select
              className="h-9 px-2 rounded-lg border text-sm"
              value={dailyRange}
              onChange={e => { const v = Number(e.target.value); setDailyRange(v); refreshAll(stored, v); }}
            >
              <option value={7}>7 days</option>
              <option value={30}>30 days</option>
              <option value={90}>90 days</option>
            </select>
            <Btn onClick={()=>refreshAll(stored, dailyRange)} id="refresh">{loading ? 'Refreshing…' : 'Refresh'}</Btn>
          </div>
        }
      >
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
          <Btn onClick={debugCoupons} id="debug">Debug: Log coupon keys</Btn>
          <Btn onClick={repairCoupons} id="repair">Repair coupon keys</Btn>
          <Btn onClick={()=>downloadCsv('/api/admin/export/coupons', 'coupons.csv')}>Download coupons CSV</Btn>
          <Btn onClick={()=>downloadCsv('/api/admin/export/stats', 'stats_daily.csv')}>Download stats CSV</Btn>
        </div>
        {debugDump && (
          <pre className="mt-3 text-xs bg-neutral-50 border rounded-lg p-3 max-h-80 overflow-auto">
            {JSON.stringify(debugDump, null, 2)}
          </pre>
        )}
      </Card>

      {/* Global Visitor Allowance */}
      <Card title="Global Visitor Allowance">
        <form onSubmit={saveDefaults} className="flex items-center gap-3 flex-wrap">
          <label htmlFor="default-mins" className="text-sm">Default minutes</label>
          <input
            id="default-mins"
            name="defaultMinutes"
            type="text"
            inputMode="numeric"
            ref={minsRef}
            defaultValue={String(defaults.defaultMinutes)}
            className="h-9 px-3 rounded-lg border w-40"
            autoComplete="off"
          />
          <label htmlFor="default-uses" className="text-sm">Default uses</label>
          <input
            id="default-uses"
            name="defaultUses"
            type="text"
            inputMode="numeric"
            ref={usesRef}
            defaultValue={String(defaults.defaultUses)}
            className="h-9 px-3 rounded-lg border w-36"
            autoComplete="off"
          />
          <Btn kind="primary" id="saveDefaults" type="submit">Save defaults</Btn>
          <Btn onClick={() => {
            if (codeRef.current) codeRef.current.value = '';
            if (cMinsRef.current) cMinsRef.current.value = String(defaults.defaultMinutes);
            if (cUsesRef.current) cUsesRef.current.value = String(defaults.defaultUses);
          }}>
            Use defaults in form
          </Btn>
        </form>
      </Card>

      {/* Create / Edit Coupon */}
      <Card title="Create / Edit Coupon">
        <form onSubmit={createOrUpdateCoupon} className="flex items-center gap-3 flex-wrap">
          <label htmlFor="coupon-code" className="text-sm">Code</label>
          <input
            id="coupon-code"
            name="code"
            placeholder="code (e.g., chickenpotpie)"
            ref={codeRef}
            className="h-9 px-3 rounded-lg border w-60"
            autoComplete="off"
          />
          <label htmlFor="coupon-minutes" className="text-sm">Minutes</label>
          <input
            id="coupon-minutes"
            name="minutes"
            type="text"
            inputMode="numeric"
            placeholder="minutes"
            ref={cMinsRef}
            defaultValue={String(defaults.defaultMinutes)}
            className="h-9 px-3 rounded-lg border w-36"
            autoComplete="off"
          />
          <label htmlFor="coupon-uses" className="text-sm">Uses</label>
          <input
            id="coupon-uses"
            name="uses"
            type="text"
            inputMode="numeric"
            placeholder="uses"
            ref={cUsesRef}
            defaultValue={String(defaults.defaultUses)}
            className="h-9 px-3 rounded-lg border w-32"
            autoComplete="off"
          />
          <Btn kind="primary" id="saveCoupon" type="submit">Save Coupon</Btn>
          <Btn onClick={clearCouponForm}>Clear</Btn>
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
        <div className="grid md:grid-cols-2 gap-4">
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

          {/* Grant form */}
          <div>
            <h3 className="font-semibold mb-2">Grant override to IP</h3>
            <div className="grid gap-2">
              <label className="grid text-sm gap-1">
                <span>IP (v4)</span>
                <input className="h-9 px-3 rounded-lg border" value={grant.ip} onChange={e=>setGrant({...grant, ip: e.target.value})} placeholder="e.g. 203.0.113.42" />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="grid text-sm gap-1">
                  <span>Minutes</span>
                  <input className="h-9 px-3 rounded-lg border" type="number" value={grant.minutes} onChange={e=>setGrant({...grant, minutes: Number(e.target.value)})} />
                </label>
                <label className="grid text-sm gap-1">
                  <span>Uses</span>
                  <input className="h-9 px-3 rounded-lg border" type="number" value={grant.uses} onChange={e=>setGrant({...grant, uses: Number(e.target.value)})} />
                </label>
              </div>
              <div>
                <Btn onClick={grantIp} id="grant" kind="primary">Grant override</Btn>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Stats */}
      <Card
        title="Usage Stats"
        right={
          <div className="flex items-center gap-2">
            <select
              className="h-9 px-2 rounded-lg border text-sm"
              value={stackMode}
              onChange={e => setStackMode(e.target.value as 'age'|'genre')}
              title="Stacked chart mode"
            >
              <option value="age">Stack: Age</option>
              <option value="genre">Stack: Genre</option>
            </select>
            <Btn onClick={() => refreshAll(stored, dailyRange)}>Refresh</Btn>
          </div>
        }
      >
        {!stats && <p className="text-sm text-neutral-600">No stats yet.</p>}
        {stats && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-2">
              <div className="rounded-lg border p-3">
                <div className="text-xs text-neutral-600">Total generations</div>
                <div className="text-2xl font-semibold tabular-nums">{stats.total}</div>
              </div>
            </div>

            {daily?.points?.length ? (
              <div className="mt-4">
                <div className="mb-2">
                  {stackMode === 'age'
                    ? <Legend items={[...AGE_KEYS]} colors={AGE_COLORS} />
                    : <Legend items={[...GENRE_KEYS]} colors={GENRE_COLORS} />
                  }
                </div>
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <StackedChart
                      points={daily.points}
                      keys={stackMode === 'age' ? [...AGE_KEYS] : [...GENRE_KEYS]}
                      colors={stackMode === 'age' ? AGE_COLORS : GENRE_COLORS}
                    />
                  </div>
                  <div className="w-24 text-right text-xs text-neutral-600">
                    Last {daily.days} days
                  </div>
                </div>
              </div>
            ) : null}

            <div className="grid md:grid-cols-2 gap-6 mt-6">
              <Facet title="By Age (all-time)" data={stats.byAge} />
              <Facet title="By Genre (all-time)" data={stats.byGenre} />
              <Facet title="By Length (all-time)" data={stats.byLength} />
              <Facet title="By Level (all-time)" data={stats.byLevel} />
              <Facet title="By Period (all-time)" data={stats.byPeriod} />
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

function Facet({ title, data }:{ title: string; data: Record<string, number> }) {
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
