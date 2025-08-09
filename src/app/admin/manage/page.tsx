"use client";

import React, { useEffect, useMemo, useState } from "react";

// --- Types ---
type Defaults = {
  defaultMinutes: number;
  defaultUses: number;
};

type Coupon = {
  code: string;
  minutes: number;
  uses: number;
  // optional fields your API might include:
  remaining?: number;
  expiresAt?: number;
};

type ApiResult<T> = { ok: boolean; error?: string } & T;

// --- Helpers ---
async function fetchJSON<T>(url: string, adminKey: string): Promise<T> {
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "content-type": "application/json",
      "x-admin-key": adminKey || "",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(msg || `Request failed ${res.status}`);
  }
  return res.json();
}

async function postJSON<T>(url: string, adminKey: string, body: any): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-admin-key": adminKey || "",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(msg || `Request failed ${res.status}`);
  }
  return res.json();
}

async function del(url: string, adminKey: string): Promise<void> {
  const res = await fetch(url, {
    method: "DELETE",
    headers: {
      "x-admin-key": adminKey || "",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(msg || `Request failed ${res.status}`);
  }
}

// --- Component ---
export default function AdminManagePage() {
  const [adminKey, setAdminKey] = useState<string>("");
  const [defaults, setDefaults] = useState<Defaults>({ defaultMinutes: 0, defaultUses: 0 });
  const [loading, setLoading] = useState<boolean>(true);
  const [err, setErr] = useState<string>("");

  // Coupon form
  const [form, setForm] = useState<Coupon>({ code: "", minutes: 0, uses: 0 });
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const hasKey = useMemo(() => (adminKey || "").trim().length > 0, [adminKey]);

  useEffect(() => {
    const stored = localStorage.getItem("adminKey") || "";
    if (stored) setAdminKey(stored);
  }, []);

  useEffect(() => {
    if (!hasKey) {
      setLoading(false);
      return;
    }
    refreshAll(adminKey).catch((e) => setErr(e.message || "Failed to load admin data"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasKey]);

  async function refreshAll(key: string) {
    try {
      setLoading(true);
      setErr("");
      const d = await fetchJSON<ApiResult<Defaults & {}>>("/api/admin/settings", key);
      if (!d.ok) throw new Error(d.error || "Failed to load defaults");
      setDefaults({ defaultMinutes: d.defaultMinutes, defaultUses: d.defaultUses });

      const list = await fetchJSON<ApiResult<{ coupons: Coupon[] }>>("/api/admin/coupons", key);
      if (!list.ok) throw new Error(list.error || "Failed to load coupons");
      setCoupons(list.coupons || []);
    } finally {
      setLoading(false);
    }
  }

  function saveKey() {
    localStorage.setItem("adminKey", adminKey);
    refreshAll(adminKey).catch((e) => setErr(e.message || "Failed to load admin data"));
  }

  async function saveDefaults(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    try {
      const res = await postJSON<ApiResult<{}>>(
        "/api/admin/settings",
        adminKey,
        {
          defaultMinutes: Number(defaults.defaultMinutes) || 0,
          defaultUses: Number(defaults.defaultUses) || 0,
        }
      );
      if (!res.ok) throw new Error(res.error || "Failed to save defaults");
      await refreshAll(adminKey);
    } catch (e: any) {
      setErr(e.message || "Failed to save defaults");
    }
  }

  function applyDefaultsToForm() {
    setForm((f) => ({
      ...f,
      minutes: Number(defaults.defaultMinutes) || 0,
      uses: Number(defaults.defaultUses) || 0,
    }));
  }

  async function upsertCoupon(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    try {
      if (!form.code.trim()) throw new Error("Coupon code is required.");
      const res = await postJSON<ApiResult<{}>>(
        "/api/admin/coupons",
        adminKey,
        {
          code: form.code.trim(),
          minutes: Number(form.minutes) || 0,
          uses: Number(form.uses) || 0,
        }
      );
      if (!res.ok) throw new Error(res.error || "Failed to upsert coupon");
      setForm((f) => ({ ...f, code: f.code.trim() }));
      await refreshAll(adminKey);
    } catch (e: any) {
      setErr(e.message || "Failed to upsert coupon");
    }
  }

  async function deleteCoupon(code: string) {
    if (!confirm(`Delete coupon "${code}"?`)) return;
    setErr("");
    try {
      await del(`/api/admin/coupons?code=${encodeURIComponent(code)}`, adminKey);
      await refreshAll(adminKey);
    } catch (e: any) {
      setErr(e.message || "Failed to delete coupon");
    }
  }

  return (
    <main style={{ maxWidth: 900, margin: "24px auto", padding: "0 16px" }}>
      <h1>Admin</h1>

      {/* Admin key */}
      <section style={{ margin: "16px 0", padding: 12, border: "1px solid #ddd" }}>
        <h2>Authentication</h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            type="password"
            placeholder="Enter admin key"
            value={adminKey}
            onChange={(e) => setAdminKey(e.target.value)}
            style={{ minWidth: 280, padding: 6 }}
          />
          <button onClick={saveKey}>Save key</button>
          {hasKey ? <span style={{ color: "green" }}>Key set</span> : <span>Enter your admin key</span>}
        </div>
      </section>

      {/* Global Visitor Allowance */}
      <section style={{ margin: "16px 0", padding: 12, border: "1px solid #ddd" }}>
        <h2>Global Visitor Allowance</h2>
        <form onSubmit={saveDefaults} noValidate>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <label htmlFor="default-mins" style={{ minWidth: 140 }}>Default minutes</label>
            <input
              id="default-mins"
              type="number"
              min={0}
              value={defaults.defaultMinutes}
              onChange={(e) => setDefaults((d) => ({ ...d, defaultMinutes: Number(e.target.value) }))}
              style={{ width: 120, padding: 6 }}
            />
            <label htmlFor="default-uses" style={{ minWidth: 100 }}>Default uses</label>
            <input
              id="default-uses"
              type="number"
              min={0}
              value={defaults.defaultUses}
              onChange={(e) => setDefaults((d) => ({ ...d, defaultUses: Number(e.target.value) }))}
              style={{ width: 120, padding: 6 }}
            />
            <button type="submit">Save defaults</button>
            <button type="button" onClick={applyDefaultsToForm}>Use defaults in form</button>
            {/* NOTE: intentionally removed the “Apply defaults to ‘chickenpotpie’” button */}
          </div>
        </form>
        <p style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
          New visitors automatically receive this allowance (number of uses within the given minutes, per IP).
          You can still use the form below to create or edit specific coupons as needed.
        </p>
      </section>

      {/* Create / update a coupon */}
      <section style={{ margin: "16px 0", padding: 12, border: "1px solid #ddd" }}>
        <h2>Create / Update Coupon</h2>
        <form onSubmit={upsertCoupon} noValidate>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <label htmlFor="code" style={{ minWidth: 60 }}>Code</label>
            <input
              id="code"
              type="text"
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              style={{ width: 160, padding: 6 }}
            />
            <label htmlFor="minutes" style={{ minWidth: 70 }}>Minutes</label>
            <input
              id="minutes"
              type="number"
              min={0}
              value={form.minutes}
              onChange={(e) => setForm((f) => ({ ...f, minutes: Number(e.target.value) }))}
              style={{ width: 120, padding: 6 }}
            />
            <label htmlFor="uses" style={{ minWidth: 50 }}>Uses</label>
            <input
              id="uses"
              type="number"
              min={0}
              value={form.uses}
              onChange={(e) => setForm((f) => ({ ...f, uses: Number(e.target.value) }))}
              style={{ width: 120, padding: 6 }}
            />
            <button type="submit">Save coupon</button>
          </div>
        </form>
      </section>

      {/* Coupon list */}
      <section style={{ margin: "16px 0", padding: 12, border: "1px solid #ddd" }}>
        <h2>Coupons</h2>
        {loading ? (
          <p>Loading…</p>
        ) : coupons.length === 0 ? (
          <p>No coupons found.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 6 }}>Code</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 6 }}>Minutes</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 6 }}>Uses</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 6 }}>Remaining</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 6 }}>Expires</th>
                <th style={{ borderBottom: "1px solid #ddd", padding: 6 }} />
              </tr>
            </thead>
            <tbody>
              {coupons.map((c) => (
                <tr key={c.code}>
                  <td style={{ padding: 6 }}>{c.code}</td>
                  <td style={{ padding: 6, textAlign: "right" }}>{c.minutes}</td>
                  <td style={{ padding: 6, textAlign: "right" }}>{c.uses}</td>
                  <td style={{ padding: 6, textAlign: "right" }}>
                    {typeof c.remaining === "number" ? c.remaining : "—"}
                  </td>
                  <td style={{ padding: 6 }}>
                    {c.expiresAt ? new Date(c.expiresAt).toLocaleString() : "—"}
                  </td>
                  <td style={{ padding: 6, textAlign: "right" }}>
                    <button onClick={() => deleteCoupon(c.code)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {err ? (
        <p style={{ color: "crimson", marginTop: 8 }}>
          {String(err)}
        </p>
      ) : null}
    </main>
  );
}
