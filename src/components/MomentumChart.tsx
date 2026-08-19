/**
 * MomentumChart — minute-by-minute attacking momentum (FotMob). Positive =
 * home pressure (red, above baseline), negative = away (blue, below). Goal
 * markers sit on the scoring side; dashed halftime line at 45'. Server
 * component (static SVG).
 */
export type MomentumPoint = { minute: number; value: number };
export type MomentumGoal = { minute: number | null; isHome: boolean; player: string };

const HOME = '#e11d48';
const AWAY = '#2563eb';
const Wd = 320;
const Ht = 96;
const PAD = 8;
const BASE = Ht / 2;

export function MomentumChart({ data, goals, homeName, awayName }: { data: MomentumPoint[]; goals?: MomentumGoal[]; homeName: string; awayName: string }) {
  if (!data || data.length < 3) return null;
  const maxMin = Math.max(...data.map((d) => d.minute), 90);
  const maxAbs = Math.max(...data.map((d) => Math.abs(d.value)), 1);
  const xOf = (m: number) => PAD + (m / maxMin) * (Wd - PAD * 2);
  const yOf = (v: number) => BASE - (v / maxAbs) * (BASE - 4);

  const pts = data.map((d) => `${xOf(d.minute).toFixed(1)},${yOf(d.value).toFixed(1)}`);
  const area = `M ${xOf(data[0].minute).toFixed(1)},${BASE} L ${pts.join(' L ')} L ${xOf(data[data.length - 1].minute).toFixed(1)},${BASE} Z`;
  const htX = xOf(45);
  const goalList = (goals || []).filter((g) => g.minute != null);

  return (
    <section className="modern-card rounded-2xl border border-stone-200/80 bg-white p-6 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="border-r-[3px] border-[var(--accent)] pr-3 text-xl font-black text-stone-900">מומנטום</h2>
        <div className="flex items-center gap-3 text-xs font-bold">
          <span className="flex items-center gap-1.5 text-stone-700"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: HOME }} />{homeName}</span>
          <span className="flex items-center gap-1.5 text-stone-700"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: AWAY }} />{awayName}</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${Wd} ${Ht + 14}`} className="min-w-[480px] w-full" role="img" aria-label="גרף מומנטום">
          <defs>
            <linearGradient id="momgrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={HOME} stopOpacity="0.95" />
              <stop offset="49.9%" stopColor={HOME} stopOpacity="0.75" />
              <stop offset="50%" stopColor={AWAY} stopOpacity="0.75" />
              <stop offset="100%" stopColor={AWAY} stopOpacity="0.95" />
            </linearGradient>
          </defs>
          <line x1={PAD} y1={BASE} x2={Wd - PAD} y2={BASE} stroke="#cbd5e1" strokeWidth={0.6} />
          <path d={area} fill="url(#momgrad)" stroke="none" />
          <line x1={htX} y1={2} x2={htX} y2={Ht} stroke="#94a3b8" strokeWidth={0.6} strokeDasharray="2 2" />
          {goalList.map((g, i) => {
            const gx = xOf(g.minute as number);
            const gy = g.isHome ? 9 : Ht - 9;
            return (
              <g key={i}>
                <title>{`${g.minute}' שער · ${g.player}`}</title>
                <circle cx={gx} cy={gy} r={4.2} fill="#fff" stroke={g.isHome ? HOME : AWAY} strokeWidth={1} />
                <text x={gx} y={gy + 2.6} textAnchor="middle" fontSize="5.5">⚽</text>
              </g>
            );
          })}
          <text x={PAD} y={Ht + 11} fontSize="7" fontWeight="700" fill="#64748b">0′</text>
          <text x={htX} y={Ht + 11} fontSize="7" fontWeight="700" fill="#64748b" textAnchor="middle">HT</text>
          <text x={Wd - PAD} y={Ht + 11} fontSize="7" fontWeight="700" fill="#64748b" textAnchor="end">FT</text>
        </svg>
      </div>
    </section>
  );
}
