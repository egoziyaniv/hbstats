/**
 * CoachTimeline — vertical season-by-season list of coaches who managed a
 * team. Each season header lists the coach(es) for that year with their
 * tenure, match count, W-D-L, and photo (when available from API-Football).
 */

import type { SeasonCoachGroup, CoachTenure } from '@/lib/coach-timeline';

function pct(value: number): string {
  return `${value}%`;
}

function CoachCard({ c }: { c: CoachTenure }) {
  const initials = c.name.split(/\s+/).filter(Boolean).map((p) => p[0]).join('').toUpperCase().slice(0, 2);
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-3 shadow-sm">
      <div className="flex items-center gap-3">
        {c.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={c.photoUrl}
            alt={c.name}
            className="h-12 w-12 shrink-0 rounded-full border border-stone-200 bg-stone-100 object-cover"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-stone-100 text-sm font-black text-stone-600">
            {initials || '?'}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-black text-stone-900 truncate">{c.name}</h4>
          <p className="text-[10px] font-semibold text-stone-500" dir="ltr">{c.firstMatch} → {c.lastMatch}</p>
        </div>
        <span className="rounded-md bg-stone-100 px-2 py-0.5 text-[11px] font-bold text-stone-700 shrink-0">{c.matches} משחקים</span>
      </div>
      <div className="mt-2 flex items-center gap-2 text-[11px]">
        <span className="rounded bg-emerald-50 px-1.5 py-0.5 font-bold text-emerald-700">נ' {c.wins}</span>
        <span className="rounded bg-stone-50 px-1.5 py-0.5 font-bold text-stone-700">ת' {c.draws}</span>
        <span className="rounded bg-red-50 px-1.5 py-0.5 font-bold text-red-700">ה' {c.losses}</span>
        <span className="mr-auto text-stone-500">{c.winPct}% ניצחונות</span>
      </div>
      <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-stone-100">
        <div className="bg-emerald-500" style={{ width: pct((c.wins / c.matches) * 100) }} />
        <div className="bg-stone-400" style={{ width: pct((c.draws / c.matches) * 100) }} />
        <div className="bg-red-500" style={{ width: pct((c.losses / c.matches) * 100) }} />
      </div>
    </div>
  );
}

export function CoachTimeline({ groups }: { groups: SeasonCoachGroup[] }) {
  if (groups.length === 0) {
    return <p className="text-sm text-stone-500">אין נתוני מאמנים זמינים.</p>;
  }
  return (
    <div className="relative">
      <div className="absolute right-3 top-2 bottom-2 w-px bg-stone-200" />
      <ol className="space-y-4">
        {groups.map((g) => (
          <li key={g.seasonId} className="relative pr-8">
            <span
              className="absolute right-1.5 top-3 h-3 w-3 rounded-full border-2 border-white shadow-sm"
              style={{ backgroundColor: 'var(--accent)' }}
            />
            <div>
              <h3 className="mb-2 text-base font-black text-stone-900">{g.seasonName}</h3>
              <div className="space-y-2">
                {g.coaches.map((c, i) => (
                  <CoachCard key={`${c.name}-${i}`} c={c} />
                ))}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
