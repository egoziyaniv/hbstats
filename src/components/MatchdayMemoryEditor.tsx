'use client';

import { useState } from 'react';

export default function MatchdayMemoryEditor({ gameId, initialNote }: { gameId: string; initialNote: string | null }) {
  const [note, setNote] = useState(initialNote || '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  async function save(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setMessage('');
    try {
      const response = await fetch(`/api/account/matchdays/${gameId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ attended: true, note }) });
      if (!response.ok) throw new Error();
      setMessage('הזיכרון נשמר. רק אתם יכולים לראות אותו.');
    } catch { setMessage('השמירה לא הצליחה. נסו שוב.'); }
    finally { setSaving(false); }
  }
  return <details className="px-5 pb-4 text-sm"><summary className="cursor-pointer font-bold text-red-800">{initialNote ? 'הזיכרון שלי מהמשחק' : 'הוספת זיכרון אישי'}</summary>
    <form onSubmit={save} className="mt-3 space-y-2">
      <label htmlFor={`memory-${gameId}`} className="block text-xs text-stone-600">זיכרון פרטי — עד 1,000 תווים</label>
      <textarea id={`memory-${gameId}`} value={note} onChange={event => setNote(event.target.value)} maxLength={1000} rows={3} className="w-full rounded-xl border border-stone-300 p-3" />
      <button disabled={saving} className="rounded-lg bg-stone-900 px-4 py-2 font-bold text-white disabled:opacity-50">{saving ? 'שומר…' : 'שמירת זיכרון'}</button>
      <p role="status" className="text-xs text-stone-600">{message}</p>
    </form>
  </details>;
}
