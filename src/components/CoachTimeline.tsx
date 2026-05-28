/**
 * CoachTimeline — vertical timeline of coaches who managed a team, newest-
 * first. Each card shows the coach's tenure, match count, and W-D-L record.
 */

import type { CoachTenure } from '@/lib/coach-timeline';

function pct(value: number): string {
  return `${value}%`;
}

function tenureLabel(c: CoachTenure): string {
  const start = c.exactStart || c.firstMatch;
  const endRaw = c.exactEnd || c.lastMatch;
  // If end is within 14 days of "now" and exactEnd is missing, treat as ongoing
  const endDate = new Date(endRaw);
  const ongoing = !c.exactEnd && Date.now() - endDate.getTime() < 14 * 24 * 60 * 60 * 1000;
  return `${start} → ${ongoing ? 'נוכחי' : endRaw}`;
}

export function CoachTimeline({ coaches }: { coaches: CoachTenure[] }) {
  if (coaches.length === 0) {
    return <p className="text-sm text-stone-500">אין נתוני מאמנים זמינים.</p>;
  }
  return (
    <div className="relative">
      <div className="absolute right-3 top-2 bottom-2 w-px bg-stone-200" />
      <ol className="space-y-3">
        {coaches.map((c, i) => (
          <li key={`${c.name}-${i}`} className="relative pr-8">
            <span
              className="absolute right-1.5 top-3 h-3 w-3 rounded-full border-2 border-white shadow-sm"
              style={{ backgroundColor: 'var(--accent)' }}
            />
            <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <h3 className="text-base font-black text-stone-900">{c.name}</h3>
                  <p className="mt-0.5 text-[11px] font-semibold text-stone-500" dir="ltr">{tenureLabel(c)}</p>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="rounded-md bg-stone-100 px-2 py-0.5 font-bold text-stone-700">{c.matches} משחקים</span>
                  <span className="rounded-md bg-emerald-50 px-2 py-0.5 font-bold text-emerald-700">{c.wins} נ'</span>
                  <span className="rounded-md bg-stone-50 px-2 py-0.5 font-bold text-stone-700">{c.draws} ת'</span>
                  <span className="rounded-md bg-red-50 px-2 py-0.5 font-bold text-red-700">{c.losses} ה'</span>
                </div>
              </div>
              {/* Win-rate bar */}
              <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-stone-100">
                <div className="bg-emerald-500" style={{ width: pct((c.wins / c.matches) * 100) }} title={`${c.wins} ניצחונות`} />
                <div className="bg-stone-400" style={{ width: pct((c.draws / c.matches) * 100) }} title={`${c.draws} תיקו`} />
                <div className="bg-red-500" style={{ width: pct((c.losses / c.matches) * 100) }} title={`${c.losses} הפסדים`} />
              </div>
              <p className="mt-2 text-[11px] text-stone-500">
                {c.winPct}% ניצחונות
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
