/**
 * ShotMap — full-pitch shot map for a game (FotMob data). Shots are pre-oriented
 * so OUR home team attacks the right goal (px 0-100 left→right, py 0-100).
 * Colour = team; fill/shape = outcome; dot size ∝ xG. Server component; hover
 * detail (player, minute, xG, xGOT, situation) via native SVG <title>.
 */
export type ShotMapShot = {
  isHome: boolean;
  player: string;
  min: number | null;
  outcome: string; // goal | save | miss | block | post
  xg: number | null;
  xgot: number | null;
  situation: string | null;
  shotType: string | null;
  px: number; // 0-100 left→right (home attacks right)
  py: number; // 0-100
};

const HOME = '#e11d48';
const AWAY = '#2563eb';
const W = 105;
const H = 68;

const OUTCOME_HE: Record<string, string> = { goal: 'שער', save: 'למסגרת', miss: 'החטאה', block: 'נחסמה', post: 'קורה' };
const SITU_HE: Record<string, string> = {
  'Regular play': 'ממהלך', RegularPlay: 'ממהלך', regular: 'ממהלך',
  Corner: 'מקרן', corner: 'מקרן',
  'Fast break': 'התקפת מעבר', FastBreak: 'התקפת מעבר',
  'Set piece': 'כדור נייח', SetPiece: 'כדור נייח',
  'Free kick': 'בעיטה חופשית', FreeKick: 'בעיטה חופשית',
  Penalty: 'פנדל', penalty: 'פנדל',
  'Throw in set piece': 'מהטבעה',
};
const shotTypeHe = (t: string | null) => {
  if (!t) return null;
  const s = t.toLowerCase();
  if (s.includes('head')) return 'נגיחה';
  if (s.includes('left')) return 'רגל שמאל';
  if (s.includes('right')) return 'רגל ימין';
  return null;
};

function radius(xg: number | null, isGoal: boolean) {
  const base = 1.0 + (xg != null ? Math.min(xg, 0.9) * 2.4 : 0.4);
  return isGoal ? base + 0.5 : base;
}

function Dot({ s }: { s: ShotMapShot }) {
  const cx = (s.px / 100) * W;
  const cy = (s.py / 100) * H;
  const color = s.isHome ? HOME : AWAY;
  const isGoal = s.outcome === 'goal';
  const onTarget = s.outcome === 'goal' || s.outcome === 'save';
  const r = radius(s.xg, isGoal);
  const detail = [
    s.player,
    s.min != null ? `${s.min}'` : null,
    OUTCOME_HE[s.outcome] || s.outcome,
    s.xg != null ? `xG ${s.xg.toFixed(2)}` : null,
    s.xgot != null && s.xgot > 0 ? `xGOT ${s.xgot.toFixed(2)}` : null,
    s.situation ? SITU_HE[s.situation] || null : null,
    shotTypeHe(s.shotType),
  ].filter(Boolean);
  return (
    <g>
      <title>{detail.join(' · ')}</title>
      {isGoal ? (
        <>
          <circle cx={cx} cy={cy} r={r + 1.1} fill="none" stroke={color} strokeWidth={0.5} opacity={0.6} />
          <circle cx={cx} cy={cy} r={r} fill={color} stroke="#fff" strokeWidth={0.6} />
        </>
      ) : onTarget ? (
        <circle cx={cx} cy={cy} r={r} fill={color} stroke="#fff" strokeWidth={0.4} opacity={0.95} />
      ) : s.outcome === 'block' ? (
        <circle cx={cx} cy={cy} r={r} fill={color} opacity={0.4} />
      ) : (
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={0.7} opacity={0.85} />
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
      <rect x={0.5} y={13.85} width={16.5} height={40.3} {...line} />
      <rect x={0.5} y={24.85} width={5.5} height={18.3} {...line} />
      <rect x={-1.5} y={30.34} width={2} height={7.32} {...line} />
      <rect x={W - 0.5 - 16.5} y={13.85} width={16.5} height={40.3} {...line} />
      <rect x={W - 0.5 - 5.5} y={24.85} width={5.5} height={18.3} {...line} />
      <rect x={W - 0.5} y={30.34} width={2} height={7.32} {...line} />
    </g>
  );
}

export function ShotMap({ shots, homeName, awayName, homeXg, awayXg }: { shots: ShotMapShot[]; homeName: string; awayName: string; homeXg?: number | null; awayXg?: number | null }) {
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

      <div className="mb-3 flex items-center justify-between text-sm font-bold">
        <div className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-full" style={{ background: AWAY }} />
          <span className="text-stone-800">{awayName}</span>
          <span className="text-stone-400">· {a.goals} שער · {a.on}/{a.shots} למסגרת{awayXg != null ? ` · xG ${awayXg.toFixed(2)}` : ''}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-stone-400">{homeXg != null ? `xG ${homeXg.toFixed(2)} · ` : ''}{h.on}/{h.shots} למסגרת · {h.goals} שער ·</span>
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

      <div className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs font-semibold text-stone-600">
        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full border-2 border-white bg-stone-400 shadow" />שער</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full bg-stone-400" />למסגרת</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full border-2 border-stone-400 bg-transparent" />החטאה</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full bg-stone-400/40" />נחסמה</span>
        <span className="text-stone-400">גודל הנקודה ∝ xG · רחף לפרטים</span>
      </div>
    </section>
  );
}
