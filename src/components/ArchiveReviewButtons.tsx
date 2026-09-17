'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
export default function ArchiveReviewButtons({ id, published, updatedAt, initialLinks }: { id: string; published: boolean; updatedAt: string; initialLinks: { gameId: string; seasonId: string; playerId: string; venueId: string } }) {
  const [note, setNote] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  const router = useRouter();
  const [links, setLinks] = useState(initialLinks);
  async function review(action: 'publish' | 'reject') {
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`/api/admin/archive/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, reviewNoteHe: note, expectedUpdatedAt: updatedAt, links }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'הפעולה נכשלה');
      router.refresh(); setMessage(action === 'publish' ? 'הפריט פורסם' : 'הפריט הוחזר לתורם לתיקון');
    } catch(error) { setMessage(error instanceof Error ? error.message : 'הפעולה נכשלה'); }
    finally { setBusy(false); }
  }
  return <div className="mt-4 space-y-3 border-t pt-4"><div className="grid gap-2 sm:grid-cols-2">{([['gameId','מזהה משחק'],['seasonId','מזהה עונה'],['playerId','מזהה שחקן'],['venueId','מזהה אצטדיון']] as const).map(([key,label]) => <label key={key} className="text-xs font-bold">{label}<input dir="ltr" value={links[key]} onChange={event => setLinks(previous => ({ ...previous, [key]: event.target.value }))} className="mt-1 block w-full rounded-lg border p-2" /></label>)}</div><label className="block text-sm font-bold">הערה לתורם (חובה בהחזרה לתיקון)<textarea maxLength={2000} value={note} onChange={event => setNote(event.target.value)} rows={2} className="mt-1 block w-full rounded-lg border p-2" /></label><div className="flex flex-wrap gap-3">{!published && <button disabled={busy} onClick={() => void review('publish')} className="rounded-lg bg-emerald-800 px-4 py-2 font-bold text-white">אישור ופרסום</button>}<button disabled={busy || !note.trim()} onClick={() => void review('reject')} className="rounded-lg border border-red-800 px-4 py-2 font-bold text-red-800 disabled:opacity-40">{published ? 'הסרה מפרסום והחזרה לתיקון' : 'החזרה לתיקון'}</button></div><p role="status" className="text-sm">{message}</p></div>;
}
