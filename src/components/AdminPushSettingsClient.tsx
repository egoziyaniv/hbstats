'use client';

import { useState } from 'react';

type Flags = { goals: boolean; results: boolean; reminders: boolean; news: boolean; onThisDay: boolean };

const ROWS: Array<{ key: keyof Flags; title: string; desc: string }> = [
  { key: 'goals', title: '⚽ גולים', desc: 'התראה בזמן אמת על כל גול במשחק של קבוצה שעוקבים אחריה.' },
  { key: 'results', title: '🏁 תוצאות סיום', desc: 'התראה על התוצאה הסופית בתום המשחק.' },
  { key: 'reminders', title: '⏰ תזכורות משחק', desc: 'תזכורת כשעה לפני פתיחת משחק של קבוצה שעוקבים אחריה.' },
  { key: 'news', title: '📰 חדשות', desc: 'התראה על ידיעה חדשה מערוצי הטלגרם המוגדרים.' },
  { key: 'onThisDay', title: '📅 היום לפני X שנים', desc: 'התראה יומית אחת עם משחק היסטורי שנערך בתאריך של היום.' },
];

export default function AdminPushSettingsClient({ initialFlags }: { initialFlags: Flags }) {
  const [flags, setFlags] = useState<Flags>(initialFlags);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save(next: Flags) {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/push-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flags: next }),
      });
      const payload = await res.json();
      if (!res.ok) {
        setMessage(payload.error || 'לא הצלחנו לשמור את הגדרות ההתראות.');
        return;
      }
      setFlags(payload.flags);
      setMessage('הגדרות ההתראות נשמרו.');
    } catch {
      setMessage('לא הצלחנו לשמור את הגדרות ההתראות.');
    } finally {
      setSaving(false);
    }
  }

  function toggle(key: keyof Flags) {
    const next = { ...flags, [key]: !flags[key] };
    setFlags(next);
    save(next);
  }

  return (
    <section className="rounded-[24px] border border-stone-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-[0.25em] text-amber-700">Push Notifications</p>
      <h2 className="mt-2 text-2xl font-black text-stone-900">התראות אפליקציה — מתגי על</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
        מתג ראשי לכל סוג התראה. כיבוי כאן עוצר את ההתראה לכל המשתמשים, גם אם הפעילו אותה אצלם.
        כל משתמש יכול בנוסף לכבות סוגים שלא מעניינים אותו במסך ההעדפות באפליקציה.
      </p>

      <div className="mt-5 divide-y divide-stone-100">
        {ROWS.map((row) => (
          <div key={row.key} className="flex items-center justify-between gap-4 py-4">
            <div>
              <div className="text-base font-bold text-stone-900">{row.title}</div>
              <div className="mt-1 text-sm leading-6 text-stone-500">{row.desc}</div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={flags[row.key]}
              disabled={saving}
              onClick={() => toggle(row.key)}
              className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition disabled:opacity-60 ${
                flags[row.key] ? 'bg-emerald-500' : 'bg-stone-300'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                  flags[row.key] ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        ))}
      </div>

      {message ? <div className="mt-4 rounded-2xl bg-stone-100 px-4 py-3 text-sm font-medium text-stone-700">{message}</div> : null}
    </section>
  );
}
