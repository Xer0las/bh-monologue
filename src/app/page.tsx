'use client';
import React, { useEffect, useState } from 'react';

const AGE_GROUPS = ['Kids 7–10','Tweens 11–13','Teens 14–17','Adults 18+'] as const;
const GENRES = ['Comedy','Drama','Fantasy / Sci-Fi','Classic (heightened)'] as const;
const LENGTHS = ['Short (<45s)','Medium (45–60s)','Long (60–90s)','XL (90–120s)'] as const;
const LEVELS = ['Beginner','Advanced'] as const;
const PERIODS = ['Contemporary','Classic / Historical'] as const;

type Monologue = { ok: boolean; title?: string; text?: string; error?: string };
type Fav = { title: string; text: string; meta: string };

const FAVS_KEY = 'bh_monologue_favs_v1';

export default function Page() {
  const [age, setAge] = useState<typeof AGE_GROUPS[number]>('Teens 14–17');
  const [genre, setGenre] = useState<typeof GENRES[number]>('Comedy');
  const [length, setLength] = useState<typeof LENGTHS[number]>('Medium (45–60s)');
  const [level, setLevel] = useState<typeof LEVELS[number]>('Beginner');
  const [period, setPeriod] = useState<typeof PERIODS[number]>('Contemporary');

  const [data, setData] = useState<Monologue | null>(null);
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);

  const [favs, setFavs] = useState<Fav[]>(() => {
    if (typeof window === 'undefined') return [];
    try { return JSON.parse(localStorage.getItem(FAVS_KEY) || '[]'); } catch { return []; }
  });
  useEffect(() => { try { localStorage.setItem(FAVS_KEY, JSON.stringify(favs)); } catch {} }, [favs]);

  function track(event: string, payload?: Record<string, unknown>) {
    try {
      fetch('/api/metrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event, data: payload || {} }),
        keepalive: true,
      }).catch(() => {});
    } catch {}
  }

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const get = (k: string) => params.get(k) || '';
    const fromList = <T extends string>(val: string, list: readonly T[], fallback: T): T =>
      (list as readonly string[]).includes(val) ? (val as T) : fallback;

    setAge(fromList(get('age'), AGE_GROUPS, 'Teens 14–17'));
    setGenre(fromList(get('genre'), GENRES, 'Comedy'));
    setLength(fromList(get('length'), LENGTHS, 'Medium (45–60s)'));
    setLevel(fromList(get('level'), LEVELS, 'Beginner'));
    setPeriod(fromList(get('period'), PERIODS, 'Contemporary'));

    track('pageview', { path: window.location.pathname, qs: window.location.search });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams();
    params.set('age', age);
    params.set('genre', genre);
    params.set('length', length);
    params.set('level', level);
    params.set('period', period);
    window.history.replaceState({}, '', `?${params.toString()}`);
  }, [age, genre, length, level, period]);

  async function getMonologueClassic() {
    setLoading(true);
    setStreaming(false);
    setData(null);
    try {
      const res = await fetch('/api/monologue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ age, genre, length, level, period }),
      });
      const json = (await res.json()) as Monologue;
      setData(json);
    } catch {
      setData({ ok: false, error: 'Network error' });
    } finally {
      setLoading(false);
    }
  }

  async function getMonologueStream() {
    track('generate_clicked', { age, genre, length, level, period });

    setLoading(false);
    setStreaming(true);
    setData({ ok: true, title: '...', text: '' });
    try {
      const params = new URLSearchParams({ age, genre, length, level, period });
      const res = await fetch(`/api/monologue/stream?${params.toString()}`, { cache: 'no-store' });
      if (!res.ok || !res.body) {
        await getMonologueClassic();
        setStreaming(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let carry = '';
      let title = '';
      let body = '';
      let haveTitle = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        carry += chunk;

        if (!haveTitle) {
          const nl = carry.indexOf('\n');
          if (nl !== -1) {
            title = carry.slice(0, nl).replace(/^[#\s-]*/, '').slice(0, 120) || 'Monologue';
            let rest = carry.slice(nl + 1);
            if (rest.startsWith('\r\n')) rest = rest.slice(2);
            else if (rest.startsWith('\n')) rest = rest.slice(1);
            body += rest;
            carry = '';
            haveTitle = true;
            setData({ ok: true, title, text: body });
            continue;
          }
        } else {
          body += carry;
          carry = '';
          setData({ ok: true, title: title || 'Monologue', text: body });
        }
      }

      if (carry) {
        if (!haveTitle) title = carry.trim() || 'Monologue';
        else body += carry;
      }
      setData({ ok: true, title: title || 'Monologue', text: body.trim() });
    } catch {
      await getMonologueClassic();
    } finally {
      setStreaming(false);
    }
  }

  async function copyCurrent() {
    if (!data || !data.ok) return;
    const header = `${data.title}\n\n`;
    await navigator.clipboard.writeText(header + (data.text ?? ''));
    alert('Copied to clipboard.');
  }

  function downloadTxt() {
    if (!data || !data.ok) return;
    const header = `${data.title}\n\n`;
    const blob = new Blob([header + (data.text ?? '')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = slugify(data.title || 'monologue') + '.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function printCurrent() { window.print(); }

  function saveFavorite() {
    if (!data || !data.ok || !data.title || !data.text) return;
    const meta = [genre, age, length, level, period].join(' · ');
    const item: Fav = { title: data.title, text: data.text, meta };
    const exists = favs.find(f => f.title === item.title && f.text === item.text);
    if (!exists) setFavs([item, ...favs].slice(0, 50));
  }

  function loadFavorite(idx: number) {
    const f = favs[idx];
    if (!f) return;
    setData({ ok: true, title: f.title, text: f.text });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function removeFavorite(idx: number) {
    const next = favs.slice(0, idx).concat(favs.slice(idx + 1));
    setFavs(next);
  }

  return (
    <main className="min-h-screen max-w-5xl mx-auto p-6">
      {/* Header is visible in print now */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Banzerini House · Monologue Generator</h1>
          <p className="text-sm text-neutral-600">Pick filters, then generate. Save your favorites, print, copy, or download.</p>
        </div>
        <a
          href="https://www.banzerinihouse.org/membership"
          target="_blank"
          rel="noopener noreferrer"
          className="h-10 px-4 rounded-lg bg-black text-white flex items-center justify-center"
        >
          JOIN OUR PROGRAM!
        </a>
      </header>

      {/* Controls remain hidden for print */}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-6 gap-3 print:hidden">
        <Select label="Age" value={age} onChange={v=>setAge(v as typeof age)} options={AGE_GROUPS} />
        <Select label="Genre" value={genre} onChange={v=>setGenre(v as typeof genre)} options={GENRES} />
        <Select label="Length" value={length} onChange={v=>setLength(v as typeof length)} options={LENGTHS} />
        <Select label="Level" value={level} onChange={v=>setLevel(v as typeof level)} options={LEVELS} />
        <Select label="Time Period" value={period} onChange={v=>setPeriod(v as typeof period)} options={PERIODS} />
        <div className="flex items-end gap-2">
          <button
            onClick={getMonologueStream}
            disabled={streaming}
            className="h-10 w-full rounded-lg bg-black text-white disabled:opacity-50"
            title="Streams live text"
          >
            {streaming ? 'Generating…' : 'Get Monologue'}
          </button>
        </div>
      </div>

      {/* Output */}
      <div className="mt-6 border-t border-neutral-200 pt-6">
        {!data && <p className="text-neutral-600 text-sm print:hidden">No monologue yet.</p>}

        {data && data.ok && (
          <article className="break-inside-avoid-page">
            <h2 className="text-xl font-medium">{data.title}</h2>
            <p className="text-xs text-neutral-600 print:hidden">
              {genre} · {age} · {length} · {level} · {period}
            </p>
            <pre className="mt-3 whitespace-pre-wrap leading-relaxed">{data.text}</pre>

            <div className="mt-4 flex flex-wrap gap-2 print:hidden">
              <button onClick={copyCurrent} className="h-10 px-3 rounded-lg border">Copy</button>
              <button onClick={downloadTxt} className="h-10 px-3 rounded-lg border">Download .txt</button>
              <button onClick={printCurrent} className="h-10 px-3 rounded-lg border">Print / PDF</button>
              <button onClick={saveFavorite} className="h-10 px-3 rounded-lg border" disabled={streaming}>Save to Favorites</button>
            </div>
          </article>
        )}

        {data && !data.ok && <p className="text-red-600 text-sm print:hidden">Error: {data.error}</p>}
      </div>

      {/* Favorites */}
      <section className="mt-10 print:hidden">
        <h3 className="text-lg font-semibold">Favorites</h3>
        {favs.length === 0 && <p className="text-sm text-neutral-600 mt-1">No favorites yet.</p>}
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {favs.map((f, idx) => (
            <li key={`${f.title}-${idx}`} className="border rounded-lg p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium">{f.title}</div>
                  <div className="text-xs text-neutral-600 mt-0.5">{f.meta}</div>
                </div>
                <div className="flex gap-2">
                  <button onClick={()=>loadFavorite(idx)} className="text-xs px-2 py-1 rounded border">Load</button>
                  <button onClick={()=>removeFavorite(idx)} className="text-xs px-2 py-1 rounded border">Remove</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Install banner stays hidden in print */}
      <footer className="mt-10 print:hidden">
        <InstallPrompt />
      </footer>
    </main>
  );
}

function Select<T extends string>({
  label, value, onChange, options,
}:{
  label: string;
  value: T;
  onChange: (v: T)=>void;
  options: readonly T[] | T[];
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-medium">{label}</span>
      <select
        className="h-10 w-full rounded-lg border px-3"
        value={value}
        onChange={(e)=>onChange(e.target.value as T)}
      >
        {options.map((opt)=>(
          <option key={opt as string} value={opt as string}>{opt as string}</option>
        ))}
      </select>
    </label>
  );
}

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

/** Inline install banner **/
function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShow(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (!show) return null;

  async function doInstall() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setShow(false);
    setDeferredPrompt(null);
  }

  return (
    <div className="rounded-lg border p-3 bg-neutral-50 flex items-center justify-between">
      <span className="text-sm">Install this app for quick access.</span>
      <div className="flex gap-2">
        <button onClick={doInstall} className="h-9 px-3 rounded border">Install</button>
        <button onClick={()=>setShow(false)} className="h-9 px-3 rounded border">Not now</button>
      </div>
    </div>
  );
}
