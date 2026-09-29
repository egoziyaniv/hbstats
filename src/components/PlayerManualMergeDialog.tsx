'use client';

import React, { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { COPYABLE_FIELDS, choosePrimaryPlayer, type CopyablePlayerField } from '@/lib/player-manual-merge';

export type MergeDialogPlayer = {
  id: string; nameHe: string; nameEn: string; updatedAt: string;
  birthDate: string | null; position: string | null; nationalityEn: string | null; nationalityHe: string | null;
  photoUrl: string | null; firstNameEn: string | null; firstNameHe: string | null; lastNameEn: string | null; lastNameHe: string | null;
  events: number; lineups: number;
};

const labels: Record<CopyablePlayerField, string> = {
  birthDate: 'תאריך לידה', position: 'עמדה', nationalityEn: 'אזרחות באנגלית', nationalityHe: 'אזרחות בעברית', photoUrl: 'תמונה',
  firstNameEn: 'שם פרטי באנגלית', firstNameHe: 'שם פרטי בעברית', lastNameEn: 'שם משפחה באנגלית', lastNameHe: 'שם משפחה בעברית',
};
const empty = (value: unknown) => value === null || value === undefined || value === '';
const name = (player: MergeDialogPlayer) => player.nameHe || player.nameEn;
const plannerPlayer = (player: MergeDialogPlayer) => ({
  ...player,
  canonicalPlayerId: null,
  updatedAt: new Date(player.updatedAt),
  birthDate: player.birthDate ? new Date(player.birthDate) : null,
  _count: { events: player.events, lineupEntries: player.lineups },
});
const availableFields = (primary: MergeDialogPlayer, secondary: MergeDialogPlayer) => COPYABLE_FIELDS.filter((field) => empty(primary[field]) && !empty(secondary[field]));

export default function PlayerManualMergeDialog({ left, right }: { left: MergeDialogPlayer; right: MergeDialogPlayer }) {
  const router = useRouter();
  const defaultPrimaryId = choosePrimaryPlayer(plannerPlayer(left), plannerPlayer(right));
  const defaultPrimary = defaultPrimaryId === left.id ? left : right;
  const defaultSecondary = defaultPrimaryId === left.id ? right : left;
  const [primaryId, setPrimaryId] = useState(defaultPrimaryId);
  const [selected, setSelected] = useState<CopyablePlayerField[]>(() => availableFields(defaultPrimary, defaultSecondary));
  const [message, setMessage] = useState('');
  const [mergeId, setMergeId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [refreshing, startTransition] = useTransition();
  const primary = primaryId === left.id ? left : right;
  const secondary = primaryId === left.id ? right : left;
  const available = useMemo(() => availableFields(primary, secondary), [primary, secondary]);
  const chosen = selected.filter((field) => available.includes(field));

  function toggle(field: CopyablePlayerField) {
    setSelected((current) => current.includes(field) ? current.filter((item) => item !== field) : [...current, field]);
  }
  async function call(body: Record<string, unknown>) {
    setSaving(true); setMessage('');
    try {
      const response = await fetch('/api/admin/player-duplicates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'שמירת הפעולה נכשלה');
      return result as { mergeId?: string };
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'שמירת הפעולה נכשלה');
      return null;
    } finally { setSaving(false); }
  }
  async function merge() {
    const result = await call({ action: 'merge', primaryId: primary.id, secondaryId: secondary.id, expectedPrimaryUpdatedAt: primary.updatedAt, expectedSecondaryUpdatedAt: secondary.updatedAt, copyFields: chosen });
    if (!result?.mergeId) return;
    setMergeId(result.mergeId); setMessage(`האיחוד נשמר${chosen.length ? ` והושלמו ${chosen.map((field) => labels[field]).join(', ')}` : ''}. אפשר לבטל לפני רענון הדף.`);
  }
  async function undo() {
    if (!mergeId) return;
    const result = await call({ action: 'undo', mergeId });
    if (!result) return;
    setMergeId(null); setMessage('האיחוד בוטל והרשומות הופרדו מחדש.');
    startTransition(() => router.refresh());
  }
  return <details className="mt-3 min-w-[300px] rounded-xl border border-stone-200 bg-stone-50 p-3 text-right">
    <summary className="cursor-pointer font-black text-red-800">איחוד ידני</summary>
    <div className="mt-3 space-y-3 text-xs text-stone-700">
      <fieldset disabled={saving || refreshing || Boolean(mergeId)} className="space-y-2 disabled:opacity-60">
        <legend className="font-bold">רשומה ראשית</legend>
        {[left, right].map((player) => <label key={player.id} className="flex cursor-pointer items-start gap-2 rounded border bg-white p-2"><input type="radio" name={`primary-${left.id}-${right.id}`} checked={primaryId === player.id} onChange={() => { const nextPrimary = player.id === left.id ? left : right; const nextSecondary = player.id === left.id ? right : left; setPrimaryId(player.id); setSelected(availableFields(nextPrimary, nextSecondary)); }} /><span><strong>{name(player)}</strong><br />{player.nameEn} · {player.events} אירועים · {player.lineups} הרכבים</span></label>)}
      </fieldset>
      <div><strong>השלמת שדות חסרים מהרשומה השנייה</strong>{available.length ? <div className="mt-1 grid gap-1">{available.map((field) => <label key={field} className="flex gap-2"><input type="checkbox" checked={chosen.includes(field)} onChange={() => toggle(field)} />{labels[field]}: <span dir={field === 'birthDate' ? 'ltr' : undefined}>{String(secondary[field])}</span></label>)}</div> : <p className="mt-1 text-stone-500">אין שדות חסרים להשלמה.</p>}</div>
      <div className="rounded bg-white p-2"><strong>תצוגה מקדימה</strong><p>יוצג כשחקן אחד: {name(primary)}. נתוני המשחק של שתי הרשומות יישמרו ויצטברו יחד.</p><p>לא יועתקו ערכים קיימים או מזהי ספקים.</p></div>
      {!mergeId && <button type="button" className="rounded bg-red-700 px-3 py-2 font-bold text-white" onClick={merge}>אישור איחוד</button>}
      {mergeId && <button type="button" className="mr-2 rounded border border-stone-400 px-3 py-2 font-bold" onClick={undo}>ביטול האיחוד</button>}
    </div>
    <p role="status" className="mt-2 text-xs text-stone-600">{saving || refreshing ? 'שומר…' : message}</p>
  </details>;
}
