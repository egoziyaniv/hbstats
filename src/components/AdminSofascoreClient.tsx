'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type Status = {
  running: boolean;
  action: string | null;
  label: string | null;
  args: string[];
  startedAt: string | null;
  finishedAt: string | null;
  status: 'pending' | 'running' | 'done' | 'error';
  exitCode: number | null;
  output: string;
  error: string | null;
};

type Field = 'season' | 'limit';
type Action = {
  key: string;
  label: string;
  desc: string;
  button: string;
  buttonColor: string;
  fields: Field[];
};
const ACTIONS: Action[] = [
  {
    key: 'ratings-season',
    label: 'משיכת ציוני שחקנים — עונה נוכחית',
    desc: 'מושך ציוני שחקנים פר-משחק מ-Sofascore (Firecrawl, 1 קרדיט למשחק).',
    button: 'התחל משיכה',
    buttonColor: 'bg-blue-600 hover:bg-blue-700',
    fields: ['season', 'limit'],
  },
  {
    key: 'team-stats',
    label: 'סטטיסטיקות אגרגטיביות פר-קבוצה',
    desc: '39 מטריקות לכל קבוצה פעילה בליגת העל (Firecrawl, 1 קרדיט לקבוצה).',
    button: 'התחל משיכה',
    buttonColor: 'bg-purple-600 hover:bg-purple-700',
    fields: ['limit'],
  },
  {
    key: 'backfill',
    label: 'Backfill ציונים מ-Flashscore Lineup Entries',
    desc: 'מעתיק את הציונים שכבר נשמרו ב-GameLineupEntry → PlayerMatchRating (source=flashscore). אין שימוש ב-API חיצוני.',
    button: 'הרץ Backfill',
    buttonColor: 'bg-emerald-600 hover:bg-emerald-700',
    fields: [],
  },
];

export default function AdminSofascoreClient() {
  const [season, setSeason] = useState('2025/26');
  const [limit, setLimit] = useState('');
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLPreElement | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/sofascore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'status' }),
      });
      const json = (await res.json()) as Status;
      setStatus(json);
    } catch {}
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 2000);
    return () => clearInterval(id);
  }, [refresh]);

  // Auto-scroll log to bottom on update.
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [status?.output]);

  async function start(action: string) {
    setBusy(action);
    setError(null);
    const body: Record<string, string | number> = { action };
    if (action === 'ratings-season') {
      if (season) body.season = season;
      if (limit) body.limit = parseInt(limit, 10);
    } else if (action === 'team-stats') {
      if (limit) body.limit = parseInt(limit, 10);
    }
    try {
      const res = await fetch('/api/admin/sofascore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) setError(json?.error || `HTTP ${res.status}`);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
          ❌ {error}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-3">
        {ACTIONS.map((a) => {
          const isRunning = status?.running && status?.action === a.key;
          const isBusy = busy === a.key;
          const showSeason = a.fields.includes('season');
          const showLimit = a.fields.includes('limit');
          return (
            <div key={a.key} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-black text-stone-900">{a.label}</h3>
              <p className="mt-1 text-xs text-stone-500">{a.desc}</p>
              {showSeason ? (
                <label className="mt-3 block text-xs font-bold text-stone-700">
                  עונה
                  <input
                    type="text"
                    value={season}
                    onChange={(e) => setSeason(e.target.value)}
                    placeholder="2025/26"
                    className="mt-1 w-full rounded-lg border border-stone-300 px-2 py-1.5 text-sm"
                  />
                </label>
              ) : null}
              {showLimit ? (
                <label className="mt-2 block text-xs font-bold text-stone-700">
                  הגבלה (אופציונלי)
                  <input
                    type="number"
                    min={0}
                    value={limit}
                    onChange={(e) => setLimit(e.target.value)}
                    placeholder="ללא הגבלה"
                    className="mt-1 w-full rounded-lg border border-stone-300 px-2 py-1.5 text-sm"
                  />
                </label>
              ) : null}
              <button
                type="button"
                onClick={() => start(a.key)}
                disabled={isBusy || status?.running}
                className={`mt-3 w-full rounded-full ${a.buttonColor} px-4 py-2 text-sm font-black text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {isRunning ? '⏳ רץ עכשיו…' : a.button}
              </button>
            </div>
          );
        })}
      </div>

      {status ? (
        <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-black text-stone-900">סטטוס</h3>
              <p className="text-xs text-stone-500">
                {status.running ? '🟢 רץ' : status.status === 'done' ? '✅ הושלם' : status.status === 'error' ? '❌ שגיאה' : '⚪ בהמתנה'}
                {status.label ? ` — ${status.label}` : ''}
                {status.exitCode !== null ? ` (exit ${status.exitCode})` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={refresh}
              className="rounded-full border border-stone-300 px-3 py-1 text-xs font-bold text-stone-700 transition hover:bg-stone-100"
            >
              רענן
            </button>
          </div>
          {status.startedAt ? (
            <p className="mt-1 text-[11px] text-stone-400">
              התחיל: {new Date(status.startedAt).toLocaleString('he-IL')}
              {status.finishedAt ? ` · סיים: ${new Date(status.finishedAt).toLocaleString('he-IL')}` : ''}
            </p>
          ) : null}
          {status.output ? (
            <pre
              ref={logRef}
              dir="ltr"
              className="mt-3 max-h-96 overflow-auto rounded-lg bg-stone-900 p-3 text-[11px] leading-relaxed text-stone-100"
            >
              {status.output}
            </pre>
          ) : (
            <p className="mt-3 text-xs text-stone-400">אין פלט עדיין.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
