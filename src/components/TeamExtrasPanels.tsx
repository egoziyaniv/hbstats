/**
 * TeamExtrasPanels — squad demographics + goal-type split + xG over time
 * panels for the team page. Empty-data states render a gentle "no data"
 * message so the panel hierarchy stays consistent across rich and sparse teams.
 */
import type { DemographicsResult, GoalTypeResult, XgPoint } from '@/lib/team-extras';

export function SquadDemographicsPanel({ data }: { data: DemographicsResult }) {
  const maxAge = Math.max(1, ...data.ageBuckets.map((b) => b.count));
  const totalNat = data.nationalityCounts.reduce((s, n) => s + n.count, 0);
  if (data.avgAge == null && totalNat === 0) {
    return <p className="text-sm text-stone-500">חסרים נתוני גיל/אזרחות בסגל.</p>;
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-stone-600">גיל ממוצע</span>
        <span className="text-2xl font-black text-stone-900">{data.avgAge ?? '—'}</span>
      </div>
      <div>
        <h4 className="mb-2 text-xs font-bold text-stone-600">התפלגות גיל</h4>
        <div className="space-y-1">
          {data.ageBuckets.map((b) => (
            <div key={b.label} className="flex items-center gap-2 text-xs">
              <span className="w-12 text-stone-700">{b.label}</span>
              <div className="flex-1 overflow-hidden rounded bg-stone-100">
                <div className="h-3 bg-[var(--accent)]" style={{ width: `${(b.count / maxAge) * 100}%` }} />
              </div>
              <span className="w-6 text-left font-bold text-stone-900">{b.count}</span>
            </div>
          ))}
        </div>
      </div>
      {data.nationalityCounts.length > 0 ? (
        <div>
          <h4 className="mb-2 text-xs font-bold text-stone-600">אזרחויות</h4>
          <div className="flex flex-wrap gap-1">
            {data.nationalityCounts.slice(0, 12).map((n) => (
              <span key={n.name} className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-bold text-stone-700">
                {n.name} <span className="text-stone-400">×{n.count}</span>
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function GoalTypePanel({ data }: { data: GoalTypeResult }) {
  if (data.total === 0) return <p className="text-sm text-stone-500">אין שערים רשומים לעונה זו.</p>;
  const segments: Array<{ label: string; count: number; color: string }> = [
    { label: 'משחק פתוח', count: data.openPlay, color: 'bg-emerald-500' },
    { label: 'פנדל', count: data.penalty, color: 'bg-amber-500' },
    { label: 'עצמי', count: data.ownGoal, color: 'bg-stone-500' },
  ];
  return (
    <div className="space-y-3">
      <div className="flex h-3 overflow-hidden rounded-full bg-stone-100">
        {segments.map((s) => (
          <div key={s.label} className={s.color} style={{ width: `${(s.count / data.total) * 100}%` }} />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {segments.map((s) => (
          <div key={s.label} className="rounded-lg bg-stone-50 p-2 text-center">
            <div className={`mx-auto mb-1 h-2 w-8 rounded ${s.color}`} />
            <div className="text-xl font-black text-stone-900">{s.count}</div>
            <div className="text-[10px] font-bold text-stone-500">{s.label}</div>
          </div>
        ))}
      </div>
      <p className="text-center text-xs text-stone-500">סה&quot;כ {data.total} שערים</p>
    </div>
  );
}

export function XgOverTimePanel({ points }: { points: XgPoint[] }) {
  if (points.length === 0) {
    return <p className="text-sm text-stone-500">אין נתוני xG זמינים — Flashscore לא הביא xG למשחקים אלו.</p>;
  }
  const maxXg = Math.max(...points.flatMap((p) => [p.ourXg, p.oppXg]), 1);
  return (
    <div className="space-y-3">
      <div className="flex items-end gap-1 overflow-x-auto pb-1">
        {points.map((p, i) => (
          <div key={`${p.date}-${i}`} className="flex min-w-[24px] flex-col items-center" title={`${p.date} vs ${p.opponent}: ${p.ourXg.toFixed(2)} - ${p.oppXg.toFixed(2)}`}>
            <div className="flex h-24 flex-col-reverse justify-start">
              <div className="w-2 rounded-t bg-emerald-500" style={{ height: `${(p.ourXg / maxXg) * 96}px` }} />
            </div>
            <div className="my-0.5 h-px w-3 bg-stone-300" />
            <div className="flex h-24 flex-col justify-start">
              <div className="w-2 rounded-b bg-red-500" style={{ height: `${(p.oppXg / maxXg) * 96}px` }} />
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-end gap-3 text-[11px] font-bold">
        <span className="flex items-center gap-1"><span className="h-2 w-3 rounded bg-emerald-500" /> xG שלנו</span>
        <span className="flex items-center gap-1"><span className="h-2 w-3 rounded bg-red-500" /> xG יריב</span>
      </div>
    </div>
  );
}
