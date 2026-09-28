'use client';

import React, { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { RosterStatus, RosterStatusKind } from '@/lib/roster-status';

export default function RosterReviewActions({ playerId, expectedUpdatedAt, status }: { playerId: string; expectedUpdatedAt: string; status: RosterStatus }) {
  const router = useRouter();
  const [kind, setKind] = useState(status.kind);
  const [destination, setDestination] = useState(status.destinationNameHe || '');
  const [date, setDate] = useState(status.effectiveDate || '');
  const [saving, setSaving] = useState(false);
  const [refreshing, startTransition] = useTransition();
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setKind(status.kind);
    setDestination(status.destinationNameHe || '');
    setDate(status.effectiveDate || '');
  }, [expectedUpdatedAt, status.kind, status.destinationNameHe, status.effectiveDate]);
  async function submit(action: 'approve' | 'update' | 'reject') {
    setSaving(true);
    setMessage('');
    setFailed(false);
    try {
      const response = await fetch('/api/admin/roster-integrity', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ playerId, expectedUpdatedAt, action, ...(action !== 'reject' ? { kind, destinationNameHe: destination, effectiveDate: date } : {}) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'שמירת השינוי נכשלה');
      setMessage(action === 'reject' ? 'הסטטוס בוטל' : action === 'approve' ? 'השינויים נשמרו והסטטוס אושר' : 'העריכה נשמרה');
      startTransition(() => router.refresh());
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : 'שמירת השינוי נכשלה');
    } finally { setSaving(false); }
  }
  return <div className="min-w-[260px] space-y-2">
    <span className="text-xs font-bold text-stone-600">{status.confidence === 'VERIFIED' ? 'מאומת' : 'לבדיקה'}</span>
    <fieldset disabled={saving || refreshing} className="grid gap-2 disabled:opacity-60">
      <label className="grid gap-1 text-xs">סטטוס<select className="rounded border border-stone-300 p-1.5" value={kind} onChange={(event) => setKind(event.target.value as RosterStatusKind)}><option value="DEPARTED">עזב</option><option value="SOLD">נמכר</option><option value="LOAN">הושאל</option></select></label>
      <label className="grid gap-1 text-xs">יעד<input className="rounded border border-stone-300 p-1.5" value={destination} maxLength={200} onChange={(event) => setDestination(event.target.value)} /></label>
      <label className="grid gap-1 text-xs">תאריך<input type="date" className="rounded border border-stone-300 p-1.5" value={date} onChange={(event) => setDate(event.target.value)} /></label>
      <div className="flex flex-wrap gap-2 text-xs font-bold">
        <button type="button" className="rounded bg-emerald-700 px-2 py-2 text-white" onClick={() => submit('approve')}>שמירה ואישור</button>
        <button type="button" className="rounded bg-stone-900 px-2 py-2 text-white" onClick={() => submit('update')}>שמירת עריכה</button>
        <button type="button" className="rounded border border-red-300 px-2 py-2 text-red-700" onClick={() => submit('reject')}>דחייה</button>
      </div>
    </fieldset>
    <p className="text-xs text-stone-500">דחייה מבטלת את הסטטוס הנוכחי; הוא עשוי לחזור בסנכרון הבא.</p>
    <p role={failed ? 'alert' : 'status'} className={`text-xs ${failed ? 'text-red-700' : 'text-emerald-700'}`}>{saving || refreshing ? 'שומר ומרענן…' : message}</p>
  </div>;
}
