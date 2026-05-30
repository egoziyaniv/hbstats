'use client';

import { useState, useDeferredValue, useCallback } from 'react';

type Coach = {
  id: string;
  nameEn: string;
  nameHe: string | null;
  photoUrl: string | null;
  apiFootballCoachId: number | null;
  aliases: { alias: string }[];
  _count: { assignments: number };
  matchCount: number;
};

export default function AdminCoachesClient({ initialCoaches }: { initialCoaches: Coach[] }) {
  const [coaches, setCoaches] = useState<Coach[]>(initialCoaches);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [filter, setFilter] = useState<'all' | 'missing_he' | 'has_he'>('all');
  const [mergeSource, setMergeSource] = useState<string | null>(null);
  const [mergeTarget, setMergeTarget] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);

  const showMessage = useCallback((text: string, type: 'success' | 'error') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 4000);
  }, []);

  const saveNameHe = async (id: string, nameHe: string) => {
    const c = coaches.find((x) => x.id === id);
    if (!c || nameHe === (c.nameHe || '')) return;
    setSavingId(id);
    try {
      const res = await fetch('/api/coaches', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, nameHe }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Failed'); }
      setCoaches((prev) => prev.map((x) => (x.id === id ? { ...x, nameHe: nameHe || null } : x)));
      showMessage('נשמר', 'success');
    } catch (e: any) {
      showMessage(e.message, 'error');
    } finally {
      setSavingId(null);
    }
  };

  const doMerge = async () => {
    if (!mergeSource || !mergeTarget || mergeSource === mergeTarget) return;
    setMerging(true);
    try {
      const res = await fetch('/api/coaches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'merge', targetId: mergeTarget, sourceId: mergeSource }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setCoaches((prev) => {
        const source = prev.find((x) => x.id === mergeSource);
        return prev
          .filter((x) => x.id !== mergeSource)
          .map((x) =>
            x.id === mergeTarget && source
              ? {
                  ...x,
                  aliases: [...x.aliases, ...source.aliases],
                  matchCount: x.matchCount + source.matchCount,
                  _count: { assignments: x._count.assignments + source._count.assignments },
                }
              : x,
          );
      });
      showMessage(data.message, 'success');
      setMergeSource(null);
      setMergeTarget(null);
    } catch (e: any) {
      showMessage(e.message, 'error');
    } finally {
      setMerging(false);
    }
  };

  const filtered = coaches
    .filter((c) => {
      const q = deferredSearch.toLowerCase();
      if (q) {
        const inAny =
          c.nameEn.toLowerCase().includes(q) ||
          (c.nameHe || '').includes(q) ||
          c.aliases.some((a) => a.alias.toLowerCase().includes(q));
        if (!inAny) return false;
      }
      if (filter === 'missing_he') return !c.nameHe || !/[֐-׿]/.test(c.nameHe);
      if (filter === 'has_he') return c.nameHe && /[֐-׿]/.test(c.nameHe);
      return true;
    })
    .sort((a, b) => b.matchCount - a.matchCount);

  return (
    <div className="space-y-4">
      {message ? (
        <div
          className={`rounded-lg px-3 py-2 text-sm font-bold ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}
        >
          {message.text}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="חיפוש שם / כינוי / שם עברי"
          className="flex-1 min-w-[200px] rounded-lg border border-stone-300 px-3 py-2 text-sm"
          dir="auto"
        />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as typeof filter)}
          className="rounded-lg border border-stone-300 px-3 py-2 text-sm"
        >
          <option value="all">הכל ({coaches.length})</option>
          <option value="missing_he">חסר שם עברי</option>
          <option value="has_he">יש שם עברי</option>
        </select>
        <span className="text-xs text-stone-500">{filtered.length} מאמנים</span>
      </div>

      {mergeSource && mergeTarget && mergeSource !== mergeTarget ? (
        <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-3">
          <p className="mb-2 text-sm font-bold text-amber-900">
            מיזוג: &quot;{coaches.find((c) => c.id === mergeSource)?.nameEn}&quot; → &quot;{coaches.find((c) => c.id === mergeTarget)?.nameEn}&quot;
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={doMerge}
              disabled={merging}
              className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              {merging ? 'ממזג...' : 'אשר מיזוג'}
            </button>
            <button
              type="button"
              onClick={() => { setMergeSource(null); setMergeTarget(null); }}
              className="rounded-lg border border-amber-300 px-4 py-2 text-sm font-bold text-amber-700"
            >
              ביטול
            </button>
          </div>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white shadow-sm">
        <table className="w-full text-right text-sm">
          <thead className="bg-stone-50 text-xs font-bold text-stone-600">
            <tr>
              <th className="px-3 py-2">תמונה</th>
              <th className="px-3 py-2">שם באנגלית</th>
              <th className="px-3 py-2">שם בעברית</th>
              <th className="px-3 py-2">כינויים</th>
              <th className="px-3 py-2">משחקים</th>
              <th className="px-3 py-2">מיזוג</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} className="border-t border-stone-100 hover:bg-stone-50/60">
                <td className="px-3 py-2">
                  {c.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.photoUrl} alt={c.nameEn} className="h-10 w-10 rounded-full border border-stone-200 object-cover" />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-stone-100 text-xs font-black text-stone-500">
                      {c.nameEn.split(/\s+/).map((p) => p[0]).join('').toUpperCase().slice(0, 2)}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 font-bold" dir="ltr">{c.nameEn}</td>
                <td className="px-3 py-2">
                  <input
                    type="text"
                    defaultValue={c.nameHe || ''}
                    placeholder="הוסף שם בעברית"
                    onBlur={(e) => saveNameHe(c.id, e.target.value.trim())}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    disabled={savingId === c.id}
                    className="w-full rounded border border-stone-300 px-2 py-1 text-sm disabled:opacity-60"
                  />
                </td>
                <td className="px-3 py-2 text-xs text-stone-600">
                  {c.aliases.length > 1 ? (
                    <span title={c.aliases.map((a) => a.alias).join('\n')}>{c.aliases.length} כינויים</span>
                  ) : (
                    <span className="text-stone-400">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-center font-bold">{c.matchCount}</td>
                <td className="px-3 py-2">
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setMergeSource(mergeSource === c.id ? null : c.id)}
                      className={`rounded px-2 py-1 text-xs font-bold ${mergeSource === c.id ? 'bg-red-600 text-white' : 'border border-stone-300 text-stone-700'}`}
                    >
                      {mergeSource === c.id ? 'מקור ✓' : 'מקור'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setMergeTarget(mergeTarget === c.id ? null : c.id)}
                      className={`rounded px-2 py-1 text-xs font-bold ${mergeTarget === c.id ? 'bg-emerald-600 text-white' : 'border border-stone-300 text-stone-700'}`}
                    >
                      {mergeTarget === c.id ? 'יעד ✓' : 'יעד'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-sm text-stone-400">לא נמצאו מאמנים</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
