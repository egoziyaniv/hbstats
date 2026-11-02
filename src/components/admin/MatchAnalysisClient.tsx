'use client';

import { useState } from 'react';
import type { AdminAnalysis } from '@/lib/match-analysis/admin';

const KIND_HE = { POST: 'אחרי המשחק', PRE: 'לקראת המשחק הבא' } as const;

export default function MatchAnalysisClient({ gameId, initial, initialKind = 'POST' }: { gameId: string; initial: AdminAnalysis[]; initialKind?: 'POST' | 'PRE' }) {
  const [analyses, setAnalyses] = useState(initial);
  const [tab, setTab] = useState(Math.max(0, initial.findIndex((a) => a.kind === initialKind)));
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const current = analyses[tab];
  const [titleHe, setTitleHe] = useState(current?.titleHe ?? '');
  const [bodyHe, setBodyHe] = useState(current?.bodyHe ?? '');
  const [removed, setRemoved] = useState<Set<number>>(new Set(current?.facts.flatMap((f, i) => (f.removed ? [i] : [])) ?? []));

  function load(list: AdminAnalysis[], index: number) {
    setAnalyses(list);
    const a = list[index] ?? list[0];
    setTab(list[index] ? index : 0);
    setTitleHe(a?.titleHe ?? '');
    setBodyHe(a?.bodyHe ?? '');
    setRemoved(new Set(a?.facts.flatMap((f, i) => (f.removed ? [i] : [])) ?? []));
  }

  async function call(label: string, url: string, method: 'PUT' | 'POST', body: object, done: string) {
    setBusy(label);
    setMessage('');
    try {
      const res = await fetch(url, { method, credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setMessage(data.error || 'הפעולה נכשלה'); return; }
      load(data.analyses, tab);
      setMessage(done);
    } finally {
      setBusy('');
    }
  }

  const save = (status?: 'DRAFT' | 'PUBLISHED') =>
    call(status === 'PUBLISHED' ? 'publish' : status === 'DRAFT' ? 'unpublish' : 'save', `/api/admin/games/${gameId}/analysis`, 'PUT',
      { id: current.id, titleHe, bodyHe, removedKeys: Array.from(removed).map(String), status },
      status === 'PUBLISHED' ? 'פורסם' : status === 'DRAFT' ? 'הפרסום בוטל' : 'נשמר');

  const rewrite = async () => {
    await call('saveFacts', `/api/admin/games/${gameId}/analysis`, 'PUT', { id: current.id, removedKeys: Array.from(removed).map(String) }, '');
    await call('rewrite', `/api/admin/games/${gameId}/analysis/generate`, 'POST', { mode: 'rewrite', id: current.id }, 'נכתב מחדש מהעובדות שנשארו');
  };
  const rebuild = () => call('rebuild', `/api/admin/games/${gameId}/analysis/generate`, 'POST', { mode: 'rebuild' }, 'העובדות והטקסט חושבו מחדש');

  if (!current) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white p-6 text-center">
        <p className="text-stone-600">עדיין אין ניתוח למשחק הזה.</p>
        <button type="button" onClick={rebuild} disabled={!!busy} className="mt-4 rounded-full bg-red-800 px-5 py-2 font-bold text-white disabled:opacity-50">
          {busy ? 'מחשב…' : 'צור ניתוח'}
        </button>
        {message ? <p className="mt-3 text-sm text-red-800">{message}</p> : null}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex gap-2">
        {analyses.map((a, i) => (
          <button key={a.id} type="button" onClick={() => load(analyses, i)}
            className={`rounded-full px-4 py-2 text-sm font-bold ${i === tab ? 'bg-stone-900 text-white' : 'border border-stone-300 bg-white text-stone-700'}`}>
            {KIND_HE[a.kind]}{a.status === 'PUBLISHED' ? ' · מפורסם' : ' · טיוטה'}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm space-y-4">
        <div className="text-sm text-stone-500">{current.headline}</div>
        {current.scoreChanged ? <p className="rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-900">התוצאה השתנתה מאז שהעובדות חושבו — כדאי לחשב מחדש.</p> : null}
        {current.unknownNumbers.length ? (
          <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">מספרים בטקסט שלא מופיעים בעובדות: <b>{current.unknownNumbers.join(', ')}</b></p>
        ) : null}
        {!current.bodyHe ? <p className="rounded-xl bg-stone-50 p-3 text-sm text-stone-600">ה-AI לא כתב טקסט (אין מפתח פעיל או שגיאה). אפשר לכתוב ידנית או ללחוץ "כתוב מחדש".</p> : null}
        <label className="block">
          <span className="text-sm font-bold text-stone-700">כותרת</span>
          <input value={titleHe} onChange={(e) => setTitleHe(e.target.value)} className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2" />
        </label>
        <label className="block">
          <span className="text-sm font-bold text-stone-700">הטקסט (סעיפים מופרדים בשורה ריקה)</span>
          <textarea value={bodyHe} onChange={(e) => setBodyHe(e.target.value)} rows={14} className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 leading-7" />
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={!!busy} onClick={() => save()} className="rounded-full border border-stone-300 px-4 py-2 text-sm font-bold disabled:opacity-50">שמור</button>
          {current.status === 'PUBLISHED'
            ? <button type="button" disabled={!!busy} onClick={() => save('DRAFT')} className="rounded-full border border-red-800 px-4 py-2 text-sm font-bold text-red-800 disabled:opacity-50">בטל פרסום</button>
            : <button type="button" disabled={!!busy || !bodyHe.trim()} onClick={() => save('PUBLISHED')} className="rounded-full bg-red-800 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">אשר ופרסם</button>}
          <button type="button" disabled={!!busy} onClick={rewrite} className="rounded-full border border-stone-300 px-4 py-2 text-sm font-bold disabled:opacity-50">כתוב מחדש מהעובדות שסימנתי</button>
          <button type="button" disabled={!!busy} onClick={rebuild} className="rounded-full border border-stone-300 px-4 py-2 text-sm font-bold disabled:opacity-50">חשב הכל מחדש</button>
        </div>
        {busy ? <p className="text-sm text-stone-500">עובד…</p> : message ? <p className="text-sm font-bold text-red-800">{message}</p> : null}
      </div>

      <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-black text-stone-900">העובדות</h2>
        <p className="mt-1 text-sm text-stone-500">הטקסט נכתב מהעובדות המסומנות. בטל סימון ולחץ "כתוב מחדש" כדי להוציא עובדה.</p>
        <ul className="mt-4 space-y-3">
          {current.facts.map((f, i) => (
            <li key={`${f.key}-${i}`} className={`rounded-xl border p-3 ${removed.has(i) ? 'border-stone-200 bg-stone-50 opacity-60' : 'border-stone-300'}`}>
              <label className="flex items-start gap-3">
                <input type="checkbox" className="mt-1" checked={!removed.has(i)} onChange={() => {
                  const next = new Set(removed);
                  if (next.has(i)) next.delete(i); else next.add(i);
                  setRemoved(next);
                }} />
                <span className="min-w-0">
                  <span className="block font-bold text-stone-900">{f.textHe}</span>
                  <span className="block text-xs text-stone-500">{f.coverageHe} · נדירות {f.rarity.toFixed(2)}{f.scope === 'league' ? ' · כל הליגה' : ''}</span>
                  {f.evidenceGameIds.length ? (
                    <span className="mt-1 flex flex-wrap gap-2 text-xs">
                      {f.evidenceGameIds.map((id, k) => <a key={id} href={`/games/${id}`} target="_blank" rel="noreferrer" className="text-red-800 underline">משחק {k + 1}</a>)}
                    </span>
                  ) : null}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
