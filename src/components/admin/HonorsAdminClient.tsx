'use client';

import { useState } from 'react';
import type { HonorPlace } from '@prisma/client';

const PLACE_HE: Record<HonorPlace, string> = {
  WINNER: 'זוכה',
  RUNNER_UP: 'סגן',
};
const PLACE_ENTRIES = Object.entries(PLACE_HE) as Array<[HonorPlace, string]>;

type HonorRow = {
  id: string;
  competitionHe: string;
  place: HonorPlace;
  seasonLabel: string;
  year: number;
  displayOrder: number;
};

type FormState = {
  id: string | null;
  competitionHe: string;
  place: HonorPlace;
  seasonLabel: string;
  year: string;
  displayOrder: string;
};

const EMPTY: FormState = {
  id: null,
  competitionHe: '',
  place: 'WINNER' as HonorPlace,
  seasonLabel: '',
  year: '',
  displayOrder: '0',
};

const inputClass =
  'w-full rounded-2xl border border-stone-300 bg-stone-50 px-4 py-3 text-sm text-stone-900 focus:border-stone-400 focus:outline-none';
const labelClass = 'text-sm font-bold text-stone-700';

export default function HonorsAdminClient({ initialHonors }: { initialHonors: HonorRow[] }) {
  const [honors, setHonors] = useState<HonorRow[]>(initialHonors);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function refetch() {
    const res = await fetch('/api/admin/honors', { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      setHonors(data.honors || []);
    }
  }

  function startNew() {
    setForm(EMPTY);
    setMessage('');
  }

  function edit(honor: HonorRow) {
    setForm({
      id: honor.id,
      competitionHe: honor.competitionHe,
      place: honor.place,
      seasonLabel: honor.seasonLabel,
      year: honor.year != null ? String(honor.year) : '',
      displayOrder: String(honor.displayOrder ?? 0),
    });
    setMessage('');
  }

  async function save() {
    if (!form.competitionHe.trim()) {
      setMessage('יש להזין שם תחרות');
      return;
    }
    if (!form.seasonLabel.trim()) {
      setMessage('יש להזין עונה');
      return;
    }
    setSaving(true);
    setMessage('');

    const payload = {
      competitionHe: form.competitionHe.trim(),
      place: form.place,
      seasonLabel: form.seasonLabel.trim(),
      year: form.year.trim() ? Number(form.year) : null,
      displayOrder: form.displayOrder.trim() ? Number(form.displayOrder) : 0,
    };

    const url = form.id ? `/api/admin/honors/${form.id}` : '/api/admin/honors';
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

  async function remove(honor: HonorRow) {
    if (!window.confirm(`למחוק את "${honor.competitionHe} ${honor.seasonLabel}"?`)) return;
    setMessage('');
    try {
      const res = await fetch(`/api/admin/honors/${honor.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        setMessage('שגיאה במחיקה');
        return;
      }
      if (form.id === honor.id) setForm(EMPTY);
      await refetch();
    } catch {
      setMessage('שגיאת תקשורת');
    }
  }

  return (
    <div dir="rtl" className="grid gap-6 lg:grid-cols-[1.3fr_0.9fr]">
      {/* Honors table */}
      <section className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-black text-stone-900">הישגים ({honors.length})</h2>
          <button
            type="button"
            onClick={startNew}
            className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white"
          >
            חדש
          </button>
        </div>
        <div className="mt-4 overflow-x-auto">
          {honors.length === 0 ? (
            <p className="text-sm text-stone-500">עדיין אין הישגים. הוסף הישג חדש מהטופס.</p>
          ) : (
            <table className="w-full text-right text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-xs text-stone-500">
                  <th className="px-2 py-2 font-bold">תחרות</th>
                  <th className="px-2 py-2 font-bold">מיקום</th>
                  <th className="px-2 py-2 font-bold">עונה</th>
                  <th className="px-2 py-2 font-bold" />
                </tr>
              </thead>
              <tbody>
                {honors.map((honor) => (
                  <tr
                    key={honor.id}
                    className={`border-b border-stone-100 ${form.id === honor.id ? 'bg-red-50/40' : ''}`}
                  >
                    <td className="px-2 py-2 font-bold text-stone-900">{honor.competitionHe}</td>
                    <td className="px-2 py-2">
                      <span className="inline-block rounded-full bg-stone-200 px-2 py-0.5 text-[11px] font-semibold text-stone-600">
                        {PLACE_HE[honor.place]}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-stone-700">{honor.seasonLabel}</td>
                    <td className="px-2 py-2">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => edit(honor)}
                          className="rounded-full border border-stone-300 bg-white px-3 py-1.5 text-xs font-bold text-stone-700"
                        >
                          עריכה
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(honor)}
                          className="rounded-full border border-red-300 bg-white px-3 py-1.5 text-xs font-bold text-red-700"
                        >
                          מחיקה
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Editor form */}
      <section className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-black text-stone-900">{form.id ? 'עריכת הישג' : 'הישג חדש'}</h2>
          {message ? <span className="text-sm font-semibold text-stone-600">{message}</span> : null}
        </div>

        <div className="mt-4 grid gap-4">
          <div>
            <label className={labelClass}>תחרות</label>
            <input
              type="text"
              value={form.competitionHe}
              onChange={(e) => update('competitionHe', e.target.value)}
              className={`mt-1 ${inputClass}`}
              placeholder="ליגת העל, גביע המדינה..."
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>מיקום</label>
              <select
                value={form.place}
                onChange={(e) => update('place', e.target.value as HonorPlace)}
                className={`mt-1 ${inputClass}`}
              >
                {PLACE_ENTRIES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>עונה</label>
              <input
                type="text"
                value={form.seasonLabel}
                onChange={(e) => update('seasonLabel', e.target.value)}
                className={`mt-1 ${inputClass}`}
                placeholder="2016/17"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>שנה</label>
              <input
                type="number"
                value={form.year}
                onChange={(e) => update('year', e.target.value)}
                className={`mt-1 ${inputClass}`}
                placeholder="נגזר מהעונה אם ריק"
              />
            </div>
            <div>
              <label className={labelClass}>סדר תצוגה</label>
              <input
                type="number"
                value={form.displayOrder}
                onChange={(e) => update('displayOrder', e.target.value)}
                className={`mt-1 ${inputClass}`}
                placeholder="0"
              />
            </div>
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
