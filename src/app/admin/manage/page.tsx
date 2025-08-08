'use client';

import { useEffect, useState } from 'react';

type OverrideRow = { ip: string; remaining: number; expiresInSeconds: number };
type CouponRow = { code: string; minutes: number; uses: number };

export default function AdminManagePage() {
  const [key, setKey] = useState<string>('');
  const [stored, setStored] = useState<string>('');
  const [overrides, setOverrides] = useState<OverrideRow[]>([]);
  const [coupons, setCoupons] = useState<CouponRow[]>([]);
  const [form, setForm] = useState<CouponRow>({ code: '', minutes: 60, uses: 10 });
  const [err, setErr] = useState<string>('');

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
    try {
      const [ov, cp] = await Promise.all([
        fetch('/api/admin/overrides', { headers: { 'x-admin-key': k } }),
        fetch('/api/admin/coupons', { headers: { 'x-admin-key': k } }),
      ]);
      if (ov.status === 401 || cp.status === 401) {
        setErr('Unauthorized – check admin key.');
        setOverrides([]);
        setCoupons([]);
        return;
      }
      const ovj = await ov.json();
      const cpj = await cp.json();
      setOverrides(ovj.overrides || []);
      setCoupons(cpj.coupons || []);
    } catch (e: any) {
      setErr(e?.message || 'Network error');
    }
  }

  async function releaseIp(ip: string) {
    await fetch(`/api/admin/overrides?ip=${encodeURIComponent(ip)}`, {
      method: 'DELETE',
      headers: { 'x-admin-key': stored },
    });
    refreshAll(stored);
  }

  async function createCoupon(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch('/api/admin/coupons', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-key': stored },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      setForm({ code: '', minutes: 60, uses: 10 });
      refreshAll(stored);
    } else {
      const j = await res.json().catch(() => ({}));
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
