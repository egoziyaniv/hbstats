/**
 * SofascoreMatchStatsPanel — renders the ~40 per-match Sofascore metrics
 * grouped by section (Shots / Attack / Passes / Duels / Defending / Goalkeeping).
 *
 * Each stat row shows the away value, the label, and the home value as
 * three columns. The flex container is in the page's RTL context, so the
 * source-first item (away) appears on the visual LEFT, and the source-last
 * item (home) appears on the visual RIGHT — same side as the home badge.
 */

type Stat = {
  section: string;
  label: string;
  home: string;
  away: string;
  homeExtra?: string | null;
  awayExtra?: string | null;
};

const SECTION_HE: Record<string, string> = {
  'Shots': 'בעיטות',
  'Attack': 'התקפה',
  'Passes': 'מסירות',
  'Duels': 'דו-קרבים',
  'Defending': 'הגנה',
  'Goalkeeping': 'שוערים',
};

const LABEL_HE: Record<string, string> = {
  'Total shots': 'סך בעיטות',
  'Shots on target': 'בעיטות למסגרת',
  'Hit woodwork': 'פגיעה בקורה',
  'Shots off target': 'בעיטות מחוץ למסגרת',
  'Blocked shots': 'בעיטות חסומות',
  'Shots inside box': 'בעיטות מתוך הרחבה',
  'Shots outside box': 'בעיטות מחוץ לרחבה',
  'Big chances scored': 'מצבי שער ממומשים',
  'Big chances missed': 'מצבי שער מוחמצים',
  'Touches in opposition box': 'נגיעות ברחבה היריבה',
  'Fouled in final third': 'עבירות שספגו ב-1/3 האחרון',
  'Offsides': 'נבדלים',
  'Corners': 'קרנות',
  'Accurate passes': 'מסירות מדויקות',
  'Throw-ins': 'הכנסות',
  'Final third entries': 'כניסות ל-1/3 אחרון',
  'Passes in final third': 'מסירות ב-1/3 אחרון',
  'Long balls': 'כדורים ארוכים',
  'Crosses': 'הרמות',
  'Duels': 'דו-קרבים (אחוזי ניצחון)',
  'Dispossessed': 'איבודי כדור',
  'Ground duels': 'דו-קרבים על הקרקע',
  'Aerial duels': 'דו-קרבים אוויריים',
  'Dribbles': 'כדרורים',
  'Total tackles': 'סך גניבות',
  'Tackles won': 'גניבות מוצלחות',
  'Interceptions': 'יירוטים',
  'Recoveries': 'שחזורים',
  'Clearances': 'הרחקות',
  'Errors leading to goal': 'טעויות שהובילו לשער',
  'Goalkeeper saves': 'הצלות שוער',
  'Big saves': 'הצלות גדולות',
  'High claims': 'תפיסות גבוהות',
  'Goal kicks': 'בעיטות שער',
};

function StatRow({ stat }: { stat: Stat }) {
  const labelHe = LABEL_HE[stat.label] || stat.label;
  return (
    <div className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2">
      <div className="flex items-center justify-between gap-3 text-sm">
        <div className="flex flex-col items-start font-black text-stone-900">
          <span>{stat.away}</span>
          {stat.awayExtra ? <span className="text-xs font-semibold text-stone-500">{stat.awayExtra}</span> : null}
        </div>
        <div className="flex-1 text-center text-xs font-bold text-stone-600">{labelHe}</div>
        <div className="flex flex-col items-end font-black text-stone-900">
          <span>{stat.home}</span>
          {stat.homeExtra ? <span className="text-xs font-semibold text-stone-500">{stat.homeExtra}</span> : null}
        </div>
      </div>
    </div>
  );
}

export function SofascoreMatchStatsPanel({ stats }: { stats: Stat[] }) {
  if (!stats || stats.length === 0) return null;

  // Group by section, preserving the order they appear in the payload.
  const sections = new Map<string, Stat[]>();
  for (const s of stats) {
    if (!sections.has(s.section)) sections.set(s.section, []);
    sections.get(s.section)!.push(s);
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-indigo-200 bg-gradient-to-bl from-indigo-50 to-white p-3 text-xs text-indigo-900">
        שמאל = קבוצת חוץ · ימין = קבוצת בית
      </div>
      {Array.from(sections.entries()).map(([section, rows]) => (
        <div key={section}>
          <h4 className="mb-2 text-sm font-black text-stone-900">{SECTION_HE[section] || section}</h4>
          <div className="grid gap-2 sm:grid-cols-2">
            {rows.map((s) => <StatRow key={s.label} stat={s} />)}
          </div>
        </div>
      ))}
    </div>
  );
}
