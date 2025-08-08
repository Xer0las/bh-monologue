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
      const [st, ov, cp, df] = await Promise.all([
        fetch('/api/admin/diag', { headers: { 'x-admin-key': k }, cache: 'no-store' }),
        fetch('/api/admin/overrides', { headers: { 'x-admin-key': k }, cache: 'no-store' }),
        fetch('/api/admin/coupons', { headers: { 'x-admin-key': k }, cache: 'no-store' }),
        fetch('/api/admin/settings', { headers: { 'x-admin-key': k }, cache: 'no-store' }),
      ]);
      if (st.status === 401 || ov.status === 401 || cp.status === 401 || df.status === 401) {
        setErr('Unauthorized – check admin key.');
        setOverrides([]); setCoupons([]); setStatus(null);
      } else {
        const stj = await st.json();
        const ovj = await ov.json();
        const cpj = await cp.json();
        const dfj = await df.json();
        setStatus(stj || null);
        setOverrides(ovj.overrides || []);
        setCoupons(cpj.coupons || []);
        if (dfj?.defaults) setDefaults(dfj.defaults);
        // If first load and form is empty, apply defaults
        setForm(f => f.code ? f : { code: '', minutes: dfj?.defaults?.defaultMinutes ?? 60, uses: dfj?.defaults?.defaultUses ?? 10 });
      }
    } catch (e: any) {
      setErr(e?.message || 'Network error');
    } finally {
      setLoading(false);
    }
  }

  async function debugCoupons() {
    setDebugDump(null);
    const res = await fetch('/api/admin/coupons/debug', { headers: { 'x-admin-key': stored }, cache: 'no-store' });
    const j = await res.json().catch(()=>null);
    setDebugDump(j);
    console.log('COUPON DEBUG DUMP:', j);
  }

  async function repairCoupons() {
    setDebugDump(null);
    const res = await fetch('/api/admin/coupons/repair', { method: 'POST', headers: { 'x-admin-key': stored }, cache: 'no-store' });
    const j = await res.json().catch(()=>null);
    setDebugDump(j);
    console.log('COUPON REPAIR RESULT:', j);
    await refreshAll(stored);
  }

  async function releaseIp(ip: string) {
    await fetch(`/api/admin/overrides?ip=${encodeURIComponent(ip)}`, {
      method: 'DELETE',
      headers: { 'x-admin-key': stored },
      cache: 'no-store',
    });
    refreshAll(stored);
  }

  async function createOrUpdateCoupon(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch('/api/admin/coupons', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-key': stored },
      body: JSON.stringify(form),
      cache: 'no-store',
    });
    const j = await res.json().catch(() => ({}));
    if (res.ok) {
      setForm({ code: '', minutes: defaults.defaultMinutes, uses: defaults.defaultUses });
      console.log('CREATE_COUPON_RESPONSE', j);
      await refreshAll(stored);
    } else {
      setErr(j?.error || 'Failed to save coupon');
    }
  }

  async function deleteCoupon(code: string) {
    if (!confirm(`Delete coupon "${code}"?`)) return;
    await fetch(`/api/admin/coupons?code=${encodeURIComponent(code)}`, {
      method: 'DELETE',
      headers: { 'x-admin-key': stored },
      cache: 'no-store',
    });
    await refreshAll(stored);
  }

  async function saveDefaults(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-key': stored },
      body: JSON.stringify(defaults),
      cache: 'no-store',
    });
    const j = await res.json().catch(()=>({}));
    if (res.ok && j?.defaults) {
      setDefaults(j.defaults);
      // If form is blank, update form to new defaults
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
    const res = await fetch('/api/admin/coupons', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-key': stored },
      body: JSON.stringify({ code, minutes: defaults.defaultMinutes, uses: defaults.defaultUses }),
      cache: 'no-store',
    });
    if (res.ok) await refreshAll(stored);
  }

  return (
    <div style={{ maxWidth: 980, margin: '40px auto', padding: 16 }}>
      <h1>Admin Tools</h1>

      {/* Admin Key */}
      <section style={{ margin: '16px 0', padding: 12, border: '1px solid #ddd' }}>
        <h2>Admin Key</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label htmlFor="admin-key" style={{ minWidth: 90 }}>Key</label>
          <input
            id="admin-key"
            name="adminKey"
            type="password"
            placeholder="Enter admin key"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            style={{ width: '60%' }}
            autoComplete="off"
          />
          <button onClick={saveKey} style={{ marginLeft: 8 }}>Use Key</button>
        </div>
        {err && <p style={{ color: 'crimson' }}>{err}</p>}
      </section>

      {/* Status */}
      <section style={{ margin: '16px 0', padding: 12, border: '1px solid #ddd' }}>
        <h2>Status</h2>
        {!status && <p>—</p>}
        {status && (
          <div style={{ fontFamily: 'monospace', fontSize: 14 }}>
            <div>Storage: <strong>{status.storage}</strong></div>
            <div>ENV URL: {status.env.url ? 'set' : 'missing'} | ENV TOKEN: {status.env.token ? 'set' : 'missing'}</div>
            <div>Redis Connected: {status.redis.connected ? 'yes' : (status.redis.present ? 'no' : 'n/a')}</div>
            {typeof status.couponsCount === 'number' && (
              <div>Coupon keys: {status.couponsCount}</div>
            )}
          </div>
        )}
        <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => refreshAll(stored)} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <button onClick={debugCoupons}>Debug: Log coupon keys</button>
          <button onClick={repairCoupons}>Repair coupon keys</button>
        </div>
        {debugDump && (
          <pre style={{ marginTop: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 300, overflow: 'auto', fontSize: 12 }}>
            {JSON.stringify(debugDump, null, 2)}
          </pre>
        )}
      </section>

      {/* Global Defaults */}
      <section style={{ margin: '16px 0', padding: 12, border: '1px solid #ddd' }}>
        <h2>Global Defaults (for new coupons)</h2>
        <form onSubmit={saveDefaults} noValidate>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <label htmlFor="default-mins" style={{ minWidth: 140 }}>Default minutes</label>
            <input
              id="default-mins"
              name="defaultMinutes"
              type="number"
              value={defaults.defaultMinutes}
              onChange={(e) => setDefaults({ ...defaults, defaultMinutes: Number(e.target.value) })}
              style={{ width: 160 }}
              inputMode="numeric"
            />
            <label htmlFor="default-uses" style={{ minWidth: 140 }}>Default uses</label>
            <input
              id="default-uses"
              name="defaultUses"
              type="number"
              value={defaults.defaultUses}
              onChange={(e) => setDefaults({ ...defaults, defaultUses: Number(e.target.value) })}
              style={{ width: 160 }}
              inputMode="numeric"
            />
            <button type="submit">Save defaults</button>
            <button type="button" onClick={applyDefaultsToForm}>Use defaults in form</button>
            <button type="button" onClick={() => applyDefaultsToCode('chickenpotpie')}>
              Apply defaults to “chickenpotpie”
            </button>
          </div>
        </form>
        <p style={{ fontSize: 12, color: '#666', marginTop: 6 }}>
          These values are used as the starting values when creating coupons. You can also apply them to the
          “chickenpotpie” code with one click.
        </p>
      </section>

      {/* Create / Edit Coupon */}
      <section style={{ margin: '16px 0', padding: 12, border: '1px solid #ddd' }}>
        <h2>Create / Edit Coupon</h2>
        <form onSubmit={createOrUpdateCoupon} noValidate>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <label htmlFor="coupon-code" style={{ minWidth: 90 }}>Code</label>
            <input
              id="coupon-code"
              name="code"
              placeholder="code (e.g., chickenpotpie)"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              required
              style={{ width: 240 }}
              autoComplete="off"
            />
            <label htmlFor="coupon-minutes" style={{ minWidth: 90 }}>Minutes</label>
            <input
              id="coupon-minutes"
              name="minutes"
              type="number"
              placeholder="minutes"
              value={form.minutes}
              onChange={(e) => setForm({ ...form, minutes: Number(e.target.value) })}
              required
              style={{ width: 140 }}
              autoComplete="off"
              inputMode="numeric"
            />
            <label htmlFor="coupon-uses" style={{ minWidth: 90 }}>Uses</label>
            <input
              id="coupon-uses"
              name="uses"
              type="number"
              placeholder="uses"
              value={form.uses}
              onChange={(e) => setForm({ ...form, uses: Number(e.target.value) })}
              required
              style={{ width: 140 }}
              autoComplete="off"
              inputMode="numeric"
            />
            <button type="submit" style={{ marginLeft: 8 }}>
              {form.code ? 'Save Coupon' : 'Create Coupon'}
            </button>
            {form.code && (
              <button type="button" onClick={() => setForm({ code: '', minutes: defaults.defaultMinutes, uses: defaults.defaultUses })}>
                Clear
              </button>
            )}
          </div>
        </form>

        <h3 style={{ marginTop: 16 }}>Existing Coupons</h3>
        <table width="100%" cellPadding={6} style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th align="left">Code</th>
              <th align="right">Minutes</th>
              <th align="right">Uses</th>
              <th align="right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {coupons.map((c) => (
              <tr key={c.code}>
                <td><code>{c.code}</code></td>
                <td align="right">{c.minutes}</td>
                <td align="right">{c.uses}</td>
                <td align="right">
                  <button onClick={() => editCoupon(c)} style={{ marginRight: 6 }}>Edit</button>
                  <button onClick={() => deleteCoupon(c.code)}>Delete</button>
                </td>
              </tr>
            ))}
            {!coupons.length && (
              <tr><td colSpan={4} style={{ opacity: 0.7 }}>No coupons yet</td></tr>
            )}
          </tbody>
        </table>
      </section>

      {/* Overrides */}
      <section style={{ margin: '16px 0', padding: 12, border: '1px solid #ddd' }}>
        <h2>Overrides</h2>
        <table width="100%" cellPadding={6} style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th align="left">IP</th>
              <th align="right">Remaining</th>
              <th align="right">Expires (sec)</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {overrides.map((o) => (
              <tr key={o.ip}>
                <td>{o.ip}</td>
                <td align="right">{o.remaining}</td>
                <td align="right">{o.expiresInSeconds}</td>
                <td align="right">
                  <button onClick={() => releaseIp(o.ip)}>Release</button>
                </td>
              </tr>
            ))}
            {!overrides.length && (
              <tr><td colSpan={4} style={{ opacity: 0.7 }}>No active overrides</td></tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
