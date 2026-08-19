/**
 * ShotMap — full-pitch shot map for a game, from Sofascore shotmap data
 * (SofascoreMatchStats.shotmap). Home team attacks the right goal, away the
 * left. Colour = team; fill/shape = outcome (goal / on-target / off-target /
 * blocked / woodwork). No xG labels — Sofascore carries no per-shot xG for
 * these competitions. Server component; hover detail via native SVG <title>.
 */
export type ShotMapShot = {
  isHome: boolean;
  player: string;
  min: number | null;
  outcome: string; // goal | save | miss | block | post
  situation: string | null;
  bodyPart: string | null;
  x: number; // Sofascore player coords, 0-100 (distance-from-attacked-goal, lateral)
  y: number;
  goalMouth?: { y: number; z: number; loc: string | null } | null;
};

const HOME = '#e11d48'; // rose-600
const AWAY = '#2563eb'; // blue-600
const W = 105;
const H = 68;

const OUTCOME_HE: Record<string, string> = {
  goal: 'שער',
  save: 'למסגרת',
  miss: 'החטאה',
  block: 'נחסמה',
  post: 'נגחה בקורה',
};
const BODY_HE: Record<string, string> = {
  head: 'נגיחה',
  'left-foot': 'רגל שמאל',
  'right-foot': 'רגל ימין',
  'left foot': 'רגל שמאל',
  'right foot': 'רגל ימין',
  other: 'אחר',
};
const SITU_HE: Record<string, string> = {
  corner: 'מקרן',
  'regular': 'ממהלך',
  'fast-break': 'התקפת מעבר',
  'set-piece': 'כדור נייח',
  'free-kick': 'בעיטה חופשית',
  penalty: 'פנדל',
  assisted: 'לאחר בישול',
  'throw-in-set-piece': 'מהטבעה',
};

function project(s: ShotMapShot): { px: number; py: number } {
  // Sofascore normalises every shot as if attacking the goal at x≈0. Render home
  // attacking the right goal (mirror), away attacking the left.
  if (s.isHome) return { px: ((100 - s.x) / 100) * W, py: (s.y / 100) * H };
  return { px: (s.x / 100) * W, py: ((100 - s.y) / 100) * H };
}

function Dot({ s }: { s: ShotMapShot }) {
  const { px, py } = project(s);
  const color = s.isHome ? HOME : AWAY;
  const isGoal = s.outcome === 'goal';
  const onTarget = s.outcome === 'goal' || s.outcome === 'save';
  const r = isGoal ? 1.9 : 1.35;
  const parts = [
    s.player,
    s.min != null ? `${s.min}'` : null,
    OUTCOME_HE[s.outcome] || s.outcome,
    s.bodyPart ? BODY_HE[s.bodyPart] || s.bodyPart : null,
    s.situation ? SITU_HE[s.situation] || s.situation : null,
  ].filter(Boolean);
  return (
    <g>
      <title>{parts.join(' · ')}</title>
      {isGoal ? (
        <>
          <circle cx={px} cy={py} r={r + 1.1} fill="none" stroke={color} strokeWidth={0.5} opacity={0.55} />
          <circle cx={px} cy={py} r={r} fill={color} stroke="#fff" strokeWidth={0.6} />
        </>
      ) : onTarget ? (
        <circle cx={px} cy={py} r={r} fill={color} stroke="#fff" strokeWidth={0.4} opacity={0.95} />
      ) : s.outcome === 'block' ? (
        <circle cx={px} cy={py} r={r} fill={color} opacity={0.42} />
      ) : (
        // off target / other — hollow
        <circle cx={px} cy={py} r={r} fill="none" stroke={color} strokeWidth={0.7} opacity={0.85} />
      )}
    </g>
  );
}

function PitchLines() {
  const line = { stroke: 'rgba(255,255,255,0.5)', strokeWidth: 0.35, fill: 'none' } as const;
  return (
    <g>
      <rect x={0.5} y={0.5} width={W - 1} height={H - 1} {...line} />
      <line x1={W / 2} y1={0.5} x2={W / 2} y2={H - 0.5} {...line} />
      <circle cx={W / 2} cy={H / 2} r={9.15} {...line} />
      <circle cx={W / 2} cy={H / 2} r={0.6} fill="rgba(255,255,255,0.5)" stroke="none" />
      {/* left box + 6-yard + goal */}
      <rect x={0.5} y={13.85} width={16.5} height={40.3} {...line} />
      <rect x={0.5} y={24.85} width={5.5} height={18.3} {...line} />
      <rect x={-1.5} y={30.34} width={2} height={7.32} {...line} />
      {/* right box + 6-yard + goal */}
      <rect x={W - 0.5 - 16.5} y={13.85} width={16.5} height={40.3} {...line} />
      <rect x={W - 0.5 - 5.5} y={24.85} width={5.5} height={18.3} {...line} />
      <rect x={W - 0.5} y={30.34} width={2} height={7.32} {...line} />
    </g>
  );
}

export function ShotMap({ shots, homeName, awayName }: { shots: ShotMapShot[]; homeName: string; awayName: string }) {
  if (!shots || shots.length === 0) return null;
  const tally = (home: boolean) => {
    const t = shots.filter((s) => s.isHome === home);
    return { shots: t.length, on: t.filter((s) => s.outcome === 'goal' || s.outcome === 'save').length, goals: t.filter((s) => s.outcome === 'goal').length };
  };
  const h = tally(true);
  const a = tally(false);

  return (
    <section className="modern-card rounded-2xl border border-stone-200/80 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="border-r-[3px] border-[var(--accent)] pr-3 text-xl font-black text-stone-900">מפת בעיטות</h2>
      </div>

      {/* per-team summary */}
      <div className="mb-3 flex items-center justify-between text-sm font-bold">
        <div className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-full" style={{ background: AWAY }} />
          <span className="text-stone-800">{awayName}</span>
          <span className="text-stone-400">· {a.goals} שער · {a.on}/{a.shots} למסגרת</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-stone-400">{h.on}/{h.shots} למסגרת · {h.goals} שער ·</span>
          <span className="text-stone-800">{homeName}</span>
          <span className="inline-block h-3 w-3 rounded-full" style={{ background: HOME }} />
        </div>
      </div>

      <div className="overflow-x-auto">
        <svg viewBox={`-2 -2 ${W + 4} ${H + 4}`} className="min-w-[520px] w-full" style={{ background: 'linear-gradient(90deg,#15803d,#166534)' }} role="img" aria-label="מפת בעיטות">
          <PitchLines />
          {shots.map((s, i) => (
            <Dot key={i} s={s} />
          ))}
        </svg>
      </div>

      {/* legend */}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs font-semibold text-stone-600">
        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full border-2 border-white bg-stone-400 shadow" />שער</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full bg-stone-400" />למסגרת</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full border-2 border-stone-400 bg-transparent" />החטאה</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full bg-stone-400/40" />נחסמה</span>
        <span className="text-stone-400">רחף מעל בעיטה לפרטים</span>
      </div>
    </section>
  );
}
