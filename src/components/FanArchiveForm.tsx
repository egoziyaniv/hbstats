'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ARCHIVE_TYPES } from '@/lib/fan-archive';
export type ArchiveFormValue = { id?: string; updatedAt?: string; type: string; titleHe: string; bodyHe: string; creditHe: string; eventDate: string; sourceUrl: string; imageUrl: string; gameId: string; seasonId: string; playerId: string; venueId: string; permissionGranted: boolean };
const empty: ArchiveFormValue = { type: 'MEMORY', titleHe: '', bodyHe: '', creditHe: '', eventDate: '', sourceUrl: '', imageUrl: '', gameId: '', seasonId: '', playerId: '', venueId: '', permissionGranted: false };
export default function FanArchiveForm({ initial }: { initial?: ArchiveFormValue }) {
  const [value, setValue] = useState(initial || empty), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const router = useRouter();
  function field(name: keyof ArchiveFormValue, next: string | boolean) { setValue(previous => ({ ...previous, [name]: next })); }
  async function save(action: 'draft' | 'submit') {
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`/api/club/archive${value.id ? `/${value.id}` : ''}`, { method: value.id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...value, action, expectedUpdatedAt: value.updatedAt }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'השמירה נכשלה');
      if (!initial) setValue(empty);
      else if (result.updatedAt) setValue(previous => ({ ...previous, updatedAt: result.updatedAt }));
      setMessage(action === 'draft' ? 'הטיוטה נשמרה אצלכם בלבד.' : 'הפריט נשלח לבדיקת עורך. הוא עדיין אינו ציבורי.'); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'לא ניתן לשמור כעת'); }
    finally { setBusy(false); }
  }
  return <form onSubmit={event => { event.preventDefault(); void save('submit'); }} className="space-y-4">
    <label className="block text-sm font-bold">סוג הפריט<select value={value.type} onChange={event => field('type', event.target.value)} className="mt-1 block w-full rounded-lg border p-2">{Object.entries(ARCHIVE_TYPES).map(([type, label]) => <option key={type} value={type}>{label}</option>)}</select></label>
    {([['titleHe','כותרת',160],['creditHe','קרדיט לתורם או ליוצר',120],['sourceUrl','קישור למקור',2048],['imageUrl','קישור לתמונה במקור',2048]] as const).map(([name,label,max]) => <label key={name} className="block text-sm font-bold">{label}<input type={name.endsWith('Url') ? 'url' : 'text'} required={name === 'titleHe' || name === 'creditHe'} maxLength={max} value={value[name]} onChange={event => field(name,event.target.value)} className="mt-1 block w-full rounded-lg border p-2" /></label>)}
    <label className="block text-sm font-bold">סיפור הפריט<textarea required maxLength={8000} rows={5} value={value.bodyHe} onChange={event => field('bodyHe',event.target.value)} className="mt-1 block w-full rounded-lg border p-2" /></label>
    <label className="block text-sm font-bold">תאריך, אם ידוע<input type="date" value={value.eventDate} onChange={event => field('eventDate',event.target.value)} className="mt-1 block rounded-lg border p-2" /></label>
    <p className="text-xs text-stone-500">אפשר לציין בטקסט את המשחק, העונה או השחקן הרלוונטיים. עורך הארכיון יוכל לקשר אותם.</p>
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={value.permissionGranted} onChange={event => field('permissionGranted',event.target.checked)} className="mt-1" />יש לי זכות לפרסם את החומר ואני מאשר/ת את הצגתו באתר עם הקרדיט שציינתי.</label>
    <div className="flex flex-wrap gap-3"><button disabled={busy} className="rounded-xl bg-red-800 px-4 py-2 font-bold text-white disabled:opacity-50">שליחה לבדיקה</button><button type="button" disabled={busy} onClick={() => void save('draft')} className="rounded-xl border px-4 py-2 font-bold">שמירת טיוטה</button></div><p role="status" className="text-sm">{message}</p>
  </form>;
}
