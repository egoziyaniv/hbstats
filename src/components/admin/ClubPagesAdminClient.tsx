'use client';

import { useState } from 'react';
import type { ClubPageCategory } from '@prisma/client';

const CATEGORY_HE: Record<ClubPageCategory, string> = {
  HISTORY: 'היסטוריה',
  STADIUM: 'אצטדיון',
  IDENTITY: 'זהות',
  CULTURE: 'תרבות',
};
const CATEGORY_ENTRIES = Object.entries(CATEGORY_HE) as Array<[ClubPageCategory, string]>;

type PageRow = {
  id: string;
  slug: string;
  title: string;
  category: ClubPageCategory;
  bodyHe: string;
  heroImageUrl: string | null;
  displayOrder: number;
  isPublished: boolean;
};

type FormState = {
  id: string | null;
  slug: string;
  title: string;
  category: ClubPageCategory;
  bodyHe: string;
  heroImageUrl: string;
  displayOrder: string;
  isPublished: boolean;
};

const EMPTY: FormState = {
  id: null,
  slug: '',
  title: '',
  category: 'HISTORY' as ClubPageCategory,
  bodyHe: '',
  heroImageUrl: '',
  displayOrder: '0',
  isPublished: true,
};

const inputClass =
  'w-full rounded-2xl border border-stone-300 bg-stone-50 px-4 py-3 text-sm text-stone-900 focus:border-stone-400 focus:outline-none';
const labelClass = 'text-sm font-bold text-stone-700';

export default function ClubPagesAdminClient({ initialPages }: { initialPages: PageRow[] }) {
  const [pages, setPages] = useState<PageRow[]>(initialPages);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function refetch() {
    const res = await fetch('/api/admin/club-pages', { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      setPages(data.pages || []);
    }
  }

  function startNew() {
    setForm(EMPTY);
    setMessage('');
  }

  function edit(page: PageRow) {
    setForm({
      id: page.id,
      slug: page.slug,
      title: page.title,
      category: page.category,
      bodyHe: page.bodyHe || '',
      heroImageUrl: page.heroImageUrl || '',
      displayOrder: String(page.displayOrder ?? 0),
      isPublished: page.isPublished,
    });
    setMessage('');
  }

  async function save() {
    if (!form.title.trim()) {
      setMessage('יש להזין כותרת');
      return;
    }
    setSaving(true);
    setMessage('');

    const payload = {
      slug: form.slug.trim(),
      title: form.title.trim(),
      category: form.category,
      bodyHe: form.bodyHe,
      heroImageUrl: form.heroImageUrl,
      displayOrder: form.displayOrder.trim() ? Number(form.displayOrder) : 0,
      isPublished: form.isPublished,
    };

    const url = form.id ? `/api/admin/club-pages/${form.id}` : '/api/admin/club-pages';
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

  async function remove(page: PageRow) {
    if (!window.confirm(`למחוק את "${page.title}"?`)) return;
    setMessage('');
    try {
      const res = await fetch(`/api/admin/club-pages/${page.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        setMessage('שגיאה במחיקה');
        return;
      }
      if (form.id === page.id) setForm(EMPTY);
      await refetch();
    } catch {
      setMessage('שגיאת תקשורת');
    }
  }

  return (
    <div dir="rtl" className="grid gap-6 lg:grid-cols-[0.9fr_1.3fr]">
      {/* Pages list */}
      <section className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-black text-stone-900">עמודים ({pages.length})</h2>
          <button
            type="button"
            onClick={startNew}
            className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white"
          >
            חדש
          </button>
        </div>
        <div className="mt-4 space-y-2">
          {pages.length === 0 ? (
            <p className="text-sm text-stone-500">עדיין אין עמודים. הוסף עמוד חדש מהטופס.</p>
          ) : (
            pages.map((page) => (
              <div
                key={page.id}
                className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
                  form.id === page.id ? 'border-[var(--accent)]/50 bg-red-50/40' : 'border-stone-200 bg-stone-50'
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${page.isPublished ? 'bg-green-500' : 'bg-stone-300'}`}
                      title={page.isPublished ? 'מפורסם' : 'טיוטה'}
                    />
                    <span className="truncate text-sm font-bold text-stone-900">{page.title}</span>
                  </div>
                  <span className="mt-1 inline-block rounded-full bg-stone-200 px-2 py-0.5 text-[11px] font-semibold text-stone-600">
                    {CATEGORY_HE[page.category]}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => edit(page)}
                    className="rounded-full border border-stone-300 bg-white px-3 py-1.5 text-xs font-bold text-stone-700"
                  >
                    עריכה
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(page)}
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
          <h2 className="text-lg font-black text-stone-900">{form.id ? 'עריכת עמוד' : 'עמוד חדש'}</h2>
          {message ? <span className="text-sm font-semibold text-stone-600">{message}</span> : null}
        </div>

        <div className="mt-4 grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>כותרת</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => update('title', e.target.value)}
                className={`mt-1 ${inputClass}`}
                placeholder="כותרת העמוד"
              />
            </div>
            <div>
              <label className={labelClass}>מזהה כתובת (slug)</label>
              <input
                type="text"
                value={form.slug}
                onChange={(e) => update('slug', e.target.value)}
                className={`mt-1 ${inputClass}`}
                placeholder="נוצר מהכותרת אם ריק"
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>קטגוריה</label>
            <select
              value={form.category}
              onChange={(e) => update('category', e.target.value as ClubPageCategory)}
              className={`mt-1 ${inputClass}`}
            >
              {CATEGORY_ENTRIES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>תוכן</label>
            <textarea
              value={form.bodyHe}
              onChange={(e) => update('bodyHe', e.target.value)}
              rows={12}
              className={`mt-1 ${inputClass}`}
              placeholder="גוף העמוד"
            />
          </div>

          <div>
            <label className={labelClass}>קישור לתמונת כותרת</label>
            <input
              type="text"
              value={form.heroImageUrl}
              onChange={(e) => update('heroImageUrl', e.target.value)}
              className={`mt-1 ${inputClass}`}
              placeholder="https://..."
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
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
            <div className="flex items-end">
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
