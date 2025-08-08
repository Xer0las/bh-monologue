'use client';
import React, { useState } from 'react';

const AGE_GROUPS = ['Kids 7–10','Tweens 11–13','Teens 14–17','Adults 18+'] as const;
const GENRES = ['Comedy','Drama','Fantasy / Sci-Fi','Classic (heightened)'] as const;
const LENGTHS = ['Short (<45s)','Medium (45–60s)','Long (60–90s)','XL (90–120s)'] as const;
const LEVELS = ['PG (Beginner)','Company (Advanced)'] as const;
const PERIODS = ['Contemporary','Classic / Historical'] as const;

type Monologue = { ok: boolean; title?: string; text?: string; error?: string };

export default function Page() {
  const [age, setAge] = useState<typeof AGE_GROUPS[number]>('Teens 14–17');
  const [genre, setGenre] = useState<typeof GENRES[number]>('Comedy');
  const [length, setLength] = useState<typeof LENGTHS[number]>('Medium (45–60s)');
  const [level, setLevel] = useState<typeof LEVELS[number]>('PG (Beginner)');
  const [period, setPeriod] = useState<typeof PERIODS[number]>('Contemporary');

  const [data, setData] = useState<Monologue | null>(null);
  const [loading, setLoading] = useState(false);

  async function getMonologue() {
    setLoading(true);
    setData(null);
    try {
      const res = await fetch('/api/monologue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ age, genre, length, level, period }),
      });
      const json = await res.json();
      setData(json);
    } catch (e: any) {
      setData({ ok: false, error: e?.message || 'Network error' });
    } finally {
      setLoading(false);
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

  return (
    <main className="min-h-screen max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Banzerini House · Monologue Generator</h1>
      <p className="text-sm text-neutral-600">Pick filters, then generate.</p>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-6 gap-3">
        <Select label="Age" value={age} onChange={v=>setAge(v as any)} options={AGE_GROUPS} />
        <Select label="Genre" value={genre} onChange={v=>setGenre(v as any)} options={GENRES} />
        <Select label="Length" value={length} onChange={v=>setLength(v as any)} options={LENGTHS} />
        <Select label="Level" value={level} onChange={v=>setLevel(v as any)} options={LEVELS} />
        <Select label="Time Period" value={period} onChange={v=>setPeriod(v as any)} options={PERIODS} />
        <div className="flex items-end">
          <button
            onClick={getMonologue}
            disabled={loading}
            className="h-10 w-full rounded-lg bg-black text-white disabled:opacity-50"
          >
            {loading ? 'Generating...' : 'Get Monologue'}
          </button>
        </div>
      </div>

      <div className="mt-6 border-t border-neutral-200 pt-6">
        {!data && <p className="text-neutral-600 text-sm">No monologue yet.</p>}

        {data && data.ok && (
          <article>
            <h2 className="text-xl font-medium">{data.title}</h2>
            <pre className="mt-3 whitespace-pre-wrap leading-relaxed">{data.text}</pre>

            <div className="mt-4 flex flex-wrap gap-2">
              <button onClick={copyCurrent} className="h-10 px-3 rounded-lg border">Copy</button>
              <button onClick={downloadTxt} className="h-10 px-3 rounded-lg border">Download .txt</button>
            </div>
          </article>
        )}

        {data && !data.ok && <p className="text-red-600 text-sm">Error: {data.error}</p>}
      </div>
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
