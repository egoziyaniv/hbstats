'use client';

import { useState } from 'react';
import type { HallOfFameRole } from '@prisma/client';

const ROLE_HE: Record<HallOfFameRole, string> = {
  PLAYER: 'שחקן',
  COACH: 'מאמן',
  LEGEND: 'אגדה',
};
const ROLE_ENTRIES = Object.entries(ROLE_HE) as Array<[HallOfFameRole, string]>;

type PlayerOption = { id: string; nameHe: string | null };

type EntryRow = {
  id: string;
  playerId: string | null;
  nameHe: string;
  role: HallOfFameRole;
  years: string | null;
  blurbHe: string | null;
  statLineHe: string | null;
  photoUrl: string | null;
  rank: number;
  isPublished: boolean;
  player?: { id: string; nameHe: string | null } | null;
};

type FormState = {
  id: string | null;
  playerId: string;
  nameHe: string;
  role: HallOfFameRole;
  years: string;
  blurbHe: string;
  statLineHe: string;
  photoUrl: string;
  rank: string;
  isPublished: boolean;
};

const EMPTY: FormState = {
  id: null,
  playerId: '',
  nameHe: '',
  role: 'PLAYER' as HallOfFameRole,
  years: '',
  blurbHe: '',
  statLineHe: '',
  photoUrl: '',
  rank: '0',
  isPublished: true,
};

const inputClass =
  'w-full rounded-2xl border border-stone-300 bg-stone-50 px-4 py-3 text-sm text-stone-900 focus:border-stone-400 focus:outline-none';
const labelClass = 'text-sm font-bold text-stone-700';

export default function HallOfFameAdminClient({
  initialEntries,
  players,
}: {
  initialEntries: EntryRow[];
  players: PlayerOption[];
}) {
  const [entries, setEntries] = useState<EntryRow[]>(initialEntries);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function refetch() {
    const res = await fetch('/api/admin/hall-of-fame', { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      setEntries(data.entries || []);
    }
  }

  function startNew() {
    setForm(EMPTY);
    setMessage('');
  }

  function edit(entry: EntryRow) {
    setForm({
      id: entry.id,
      playerId: entry.playerId || '',
      nameHe: entry.nameHe,
      role: entry.role,
      years: entry.years || '',
      blurbHe: entry.blurbHe || '',
      statLineHe: entry.statLineHe || '',
      photoUrl: entry.photoUrl || '',
      rank: String(entry.rank ?? 0),
      isPublished: entry.isPublished,
    });
    setMessage('');
  }

  async function save() {
    if (!form.nameHe.trim()) {
      setMessage('יש להזין שם');
      return;
    }
    setSaving(true);
    setMessage('');

    const payload = {
      playerId: form.playerId || null,
      nameHe: form.nameHe.trim(),
      role: form.role,
      years: form.years,
      blurbHe: form.blurbHe,
      statLineHe: form.statLineHe,
      photoUrl: form.photoUrl,
      rank: form.rank.trim() ? Number(form.rank) : 0,
      isPublished: form.isPublished,
    };

    const url = form.id ? `/api/admin/hall-of-fame/${form.id}` : '/api/admin/hall-of-fame';
    const method = form.id ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setMessage(data?.error || 'שגיאה בשמירה');
        setSaving(false);
        return;
      }
      await refetch();
      setForm(EMPTY);
      setMessage('נשמר בהצלחה');
    } catch {
      setMessage('שגיאת תקשורת');
    }
    setSaving(false);
  }

  async function remove(entry: EntryRow) {
    if (!window.confirm(`למחוק את "${entry.nameHe}"?`)) return;
    setMessage('');
    try {
      const res = await fetch(`/api/admin/hall-of-fame/${entry.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        setMessage('שגיאה במחיקה');
        return;
      }
      if (form.id === entry.id) setForm(EMPTY);
      await refetch();
    } catch {
      setMessage('שגיאת תקשורת');
    }
  }

  return (
    <div dir="rtl" className="grid gap-6 lg:grid-cols-[0.9fr_1.3fr]">
      {/* Entries list */}
      <section className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-black text-stone-900">היכל התהילה ({entries.length})</h2>
          <button
            type="button"
            onClick={startNew}
            className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white"
          >
            חדש
          </button>
        </div>
        <div className="mt-4 space-y-2">
          {entries.length === 0 ? (
            <p className="text-sm text-stone-500">עדיין אין דמויות. הוסף דמות חדשה מהטופס.</p>
          ) : (
            entries.map((entry) => (
              <div
                key={entry.id}
                className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
                  form.id === entry.id ? 'border-[var(--accent)]/50 bg-red-50/40' : 'border-stone-200 bg-stone-50'
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${entry.isPublished ? 'bg-green-500' : 'bg-stone-300'}`}
                      title={entry.isPublished ? 'מפורסם' : 'טיוטה'}
                    />
                    <span className="truncate text-sm font-bold text-stone-900">{entry.nameHe}</span>
                  </div>
                  <span className="mt-1 inline-block rounded-full bg-stone-200 px-2 py-0.5 text-[11px] font-semibold text-stone-600">
                    {ROLE_HE[entry.role]}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => edit(entry)}
                    className="rounded-full border border-stone-300 bg-white px-3 py-1.5 text-xs font-bold text-stone-700"
                  >
                    עריכה
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(entry)}
                    className="rounded-full border border-red-300 bg-white px-3 py-1.5 text-xs font-bold text-red-700"
                  >
                    מחיקה
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Editor form */}
      <section className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-black text-stone-900">{form.id ? 'עריכת דמות' : 'דמות חדשה'}</h2>
          {message ? <span className="text-sm font-semibold text-stone-600">{message}</span> : null}
        </div>

        <div className="mt-4 grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>שם</label>
              <input
                type="text"
                value={form.nameHe}
                onChange={(e) => update('nameHe', e.target.value)}
                className={`mt-1 ${inputClass}`}
                placeholder="שם הדמות"
              />
            </div>
            <div>
              <label className={labelClass}>תפקיד</label>
              <select
                value={form.role}
                onChange={(e) => update('role', e.target.value as HallOfFameRole)}
                className={`mt-1 ${inputClass}`}
              >
                {ROLE_ENTRIES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>שנים</label>
              <input
                type="text"
                value={form.years}
                onChange={(e) => update('years', e.target.value)}
                className={`mt-1 ${inputClass}`}
                placeholder="2013–2018"
              />
            </div>
            <div>
              <label className={labelClass}>שורת סטטיסטיקה</label>
              <input
                type="text"
                value={form.statLineHe}
                onChange={(e) => update('statLineHe', e.target.value)}
                className={`mt-1 ${inputClass}`}
                placeholder="207 הופעות · 53 שערים"
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>תיאור</label>
            <textarea
              value={form.blurbHe}
              onChange={(e) => update('blurbHe', e.target.value)}
              rows={4}
              className={`mt-1 ${inputClass}`}
              placeholder="תיאור קצר על הדמות"
            />
          </div>

          <div>
            <label className={labelClass}>קישור לתמונה</label>
            <input
              type="text"
              value={form.photoUrl}
              onChange={(e) => update('photoUrl', e.target.value)}
              className={`mt-1 ${inputClass}`}
              placeholder="https://..."
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>שחקן משויך</label>
              <select
                value={form.playerId}
                onChange={(e) => update('playerId', e.target.value)}
                className={`mt-1 ${inputClass}`}
              >
                <option value="">— ללא —</option>
                {players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nameHe || p.id}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>דירוג</label>
              <input
                type="number"
                value={form.rank}
                onChange={(e) => update('rank', e.target.value)}
                className={`mt-1 ${inputClass}`}
                placeholder="0"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2 text-sm font-semibold text-stone-700">
              <input
                type="checkbox"
                checked={form.isPublished}
                onChange={(e) => update('isPublished', e.target.checked)}
                className="h-4 w-4"
              />
              מפורסם
            </label>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-full bg-[var(--accent)] px-6 py-3 text-sm font-bold text-white disabled:opacity-60"
            >
              {saving ? 'שומר...' : 'שמור'}
            </button>
            <button
              type="button"
              onClick={startNew}
              className="rounded-full border border-stone-300 bg-white px-6 py-3 text-sm font-bold text-stone-700"
            >
              חדש
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
