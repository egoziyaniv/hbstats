'use client';

import { useState } from 'react';

type Param = { name: string; descriptionHe: string; example?: string };
type Saved = {
  id: string; titleHe: string; intentHe: string; sql: string; params: Param[]; answerHe: string; enabled: boolean; hits: number;
};
type Draft = Omit<Saved, 'id' | 'hits'> & { id?: string };

const EMPTY: Draft = { titleHe: '', intentHe: '', sql: '', params: [], answerHe: '', enabled: true };

export default function ChatSavedQueriesClient({ initial, pinned }: { initial: Saved[]; pinned: { question: string; sql: string } | null }) {
  const [list, setList] = useState(initial);
  const [draft, setDraft] = useState<Draft | null>(pinned ? { ...EMPTY, titleHe: pinned.question, intentHe: pinned.question, sql: pinned.sql } : null);
  const [values, setValues] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState<string>('');

  async function post(body: object) {
    const res = await fetch('/api/admin/chat/saved-queries', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    return { ok: res.ok, data: await res.json().catch(() => ({})) };
  }

  async function test() {
    if (!draft) return;
    setBusy(true); setPreview('');
    const { data } = await post({ test: true, sql: draft.sql, values });
    const r = data.result;
    setPreview(r?.error ? `שגיאה: ${r.error}` : `${r.rows.length} שורות${r.truncated ? ' (קוצץ)' : ''}, ${r.ms}ms\n${JSON.stringify(r.rows.slice(0, 10), null, 1)}`);
    setBusy(false);
  }

  async function save() {
    if (!draft) return;
    setBusy(true); setMessage('');
    const { ok, data } = await post(draft);
    setBusy(false);
    if (!ok) { setMessage(data.error || 'השמירה נכשלה'); return; }
    setList((prev) => [data.saved, ...prev.filter((s) => s.id !== data.saved.id)]);
    setDraft(null);
    setMessage('נשמר');
  }

  async function toggle(s: Saved) {
    const { ok, data } = await post({ ...s, enabled: !s.enabled });
    if (ok) setList((prev) => prev.map((x) => (x.id === s.id ? data.saved : x)));
  }

  async function remove(s: Saved) {
    const { ok } = await post({ id: s.id, remove: true });
    if (ok) setList((prev) => prev.filter((x) => x.id !== s.id));
  }

  const setParam = (i: number, patch: Partial<Param>) => draft && setDraft({ ...draft, params: draft.params.map((p, k) => (k === i ? { ...p, ...patch } : p)) });

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm leading-7 text-sky-950">
        שאלה שמורה = שאילתה מאומתת עם פרמטרים ($1, $2… לפי סדר הפרמטרים). כשמשתמש שואל שאלה שמתאימה ל"סוג השאלה", ה-AI רק מזהה את התבנית ומחלץ את הפרמטרים — השאילתה עצמה רצה כמו שהיא, ולכן התשובה מהירה ומדויקת. אם אין התאמה ודאית, השאלה עוברת לטיפול הרגיל.
      </div>
      {message ? <p className="text-sm font-bold text-red-800">{message}</p> : null}

      {draft ? (
        <div className="space-y-3 rounded-2xl border border-stone-300 bg-white p-5 shadow-sm">
          <label className="block"><span className="text-sm font-bold">כותרת</span>
            <input value={draft.titleHe} onChange={(e) => setDraft({ ...draft, titleHe: e.target.value })} className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2" /></label>
          <label className="block"><span className="text-sm font-bold">סוג השאלה (מה ה-AI מתאים מולו)</span>
            <textarea value={draft.intentHe} onChange={(e) => setDraft({ ...draft, intentHe: e.target.value })} rows={2} className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2" /></label>
          <label className="block"><span className="text-sm font-bold">שאילתה (SELECT על chat.*, פרמטרים $1, $2…)</span>
            <textarea value={draft.sql} onChange={(e) => setDraft({ ...draft, sql: e.target.value })} rows={8} dir="ltr" className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 font-mono text-xs" /></label>
          <div className="space-y-2">
            <span className="text-sm font-bold">פרמטרים (לפי הסדר)</span>
            {draft.params.map((p, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[1fr_2fr_1fr_1fr_auto]">
                <input placeholder="שם (player)" value={p.name} onChange={(e) => setParam(i, { name: e.target.value })} className="rounded-xl border border-stone-300 px-2 py-1 text-sm" dir="ltr" />
                <input placeholder="תיאור (שם השחקן)" value={p.descriptionHe} onChange={(e) => setParam(i, { descriptionHe: e.target.value })} className="rounded-xl border border-stone-300 px-2 py-1 text-sm" />
                <input placeholder="דוגמה" value={p.example ?? ''} onChange={(e) => setParam(i, { example: e.target.value })} className="rounded-xl border border-stone-300 px-2 py-1 text-sm" />
                <input placeholder={`ערך לבדיקה $${i + 1}`} value={values[i] ?? ''} onChange={(e) => setValues((v) => { const n = [...v]; n[i] = e.target.value; return n; })} className="rounded-xl border border-amber-300 px-2 py-1 text-sm" />
                <button type="button" onClick={() => setDraft({ ...draft, params: draft.params.filter((_, k) => k !== i) })} className="text-sm text-red-800">הסר</button>
              </div>
            ))}
            <button type="button" onClick={() => setDraft({ ...draft, params: [...draft.params, { name: '', descriptionHe: '' }] })} className="text-sm font-bold text-red-800">+ פרמטר</button>
          </div>
          <label className="block"><span className="text-sm font-bold">הנחיה לניסוח התשובה</span>
            <textarea value={draft.answerHe} onChange={(e) => setDraft({ ...draft, answerHe: e.target.value })} rows={2} className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2" /></label>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={test} className="rounded-full border border-stone-300 px-4 py-2 text-sm font-bold disabled:opacity-50">הרץ לבדיקה</button>
            <button type="button" disabled={busy} onClick={save} className="rounded-full bg-red-800 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">שמור</button>
            <button type="button" onClick={() => setDraft(null)} className="rounded-full px-4 py-2 text-sm">ביטול</button>
          </div>
          {preview ? <pre className="max-h-64 overflow-auto rounded-xl bg-stone-50 p-2 text-left text-xs" dir="ltr">{preview}</pre> : null}
        </div>
      ) : (
        <button type="button" onClick={() => setDraft({ ...EMPTY })} className="rounded-full bg-stone-900 px-4 py-2 text-sm font-bold text-white">+ שאלה שמורה חדשה</button>
      )}

      {list.map((s) => (
        <article key={s.id} className={`rounded-2xl border bg-white p-4 shadow-sm ${s.enabled ? 'border-stone-200' : 'border-stone-200 opacity-60'}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-black text-stone-900">{s.titleHe}</h2>
              <p className="text-sm text-stone-600">{s.intentHe}</p>
              <p className="mt-1 text-xs text-stone-500">פרמטרים: {(s.params || []).map((p) => p.name).join(', ') || '—'} · {s.hits} שימושים</p>
            </div>
            <div className="flex gap-2 text-sm font-bold">
              <button type="button" onClick={() => { setDraft({ ...s }); setValues((s.params || []).map((p) => p.example ?? '')); }} className="text-red-800">ערוך</button>
              <button type="button" onClick={() => toggle(s)} className="text-stone-700">{s.enabled ? 'השבת' : 'הפעל'}</button>
              <button type="button" onClick={() => remove(s)} className="text-stone-500">מחק</button>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
