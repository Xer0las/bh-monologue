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
      const [st, ov, cp] = await Promise.all([
        fetch('/api/admin/diag', { headers: { 'x-admin-key': k }, cache: 'no-store' }),
        fetch('/api/admin/overrides', { headers: { 'x-admin-key': k }, cache: 'no-store' }),
        fetch('/api/admin/coupons', { headers: { 'x-admin-key': k }, cache: 'no-store' }),
      ]);
      if (st.status === 401 || ov.status === 401 || cp.status === 401) {
        setErr('Unauthorized – check admin key.');
        setOverrides([]); setCoupons([]); setStatus(null);
      } else {
        const stj = await st.json();
        const ovj = await ov.json();
        const cpj = await cp.json();
        setStatus(stj || null);
        setOverrides(ovj.overrides || []);
        setCoupons(cpj.coupons || []);
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

  async function createCoupon(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch('/api/admin/coupons', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-key': stored },
      body: JSON.stringify(form),
      cache: 'no-store',
    });
    const j = await res.json().catch(() => ({}));
    if (res.ok) {
      setForm({ code: '', minutes: 60, uses: 10 });
      console.log('CREATE_COUPON_RESPONSE', j);
      await refreshAll(stored);
    } else {
      setErr(j?.error || 'Failed to create coupon');
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: '40px auto', padding: 16 }}>
      <h1>Admin Tools</h1>

      <section style={{ margin: '16px 0', padding: 12, border: '1px solid #ddd' }}>
        <h2>Admin Key</h2>
        <input
          type="password"
          placeholder="Enter admin key"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          style={{ width: '60%' }}
        />
        <button onClick={saveKey} style={{ marginLeft: 8 }}>Use Key</button>
        {err && <p style={{ color: 'crimson' }}>{err}</p>}
      </section>

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
        <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
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

      <section style={{ margin: '16px 0', padding: 12, border: '1px solid #ddd' }}>
        <h2>Create / Update Coupon</h2>
        <form onSubmit={createCoupon}>
          <input
            placeholder="code (e.g., chickenpotpie2)"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
            required
            style={{ width: 240 }}
          />
          <input
            type="number"
            placeholder="minutes"
            value={form.minutes}
            onChange={(e) => setForm({ ...form, minutes: Number(e.target.value) })}
            required
            style={{ width: 120, marginLeft: 8 }}
          />
          <input
            type="number"
            placeholder="uses"
            value={form.uses}
            onChange={(e) => setForm({ ...form, uses: Number(e.target.value) })}
            required
            style={{ width: 120, marginLeft: 8 }}
          />
          <button type="submit" style={{ marginLeft: 8 }}>Save</button>
        </form>
        <h3 style={{ marginTop: 16 }}>Existing Coupons</h3>
        <ul>
          {coupons.map((c) => (
            <li key={c.code}>
              <code>{c.code}</code> — {c.minutes} min, {c.uses} uses
            </li>
          ))}
          {!coupons.length && <li style={{ opacity: 0.7 }}>No coupons yet</li>}
        </ul>
      </section>
    </div>
  );
}
