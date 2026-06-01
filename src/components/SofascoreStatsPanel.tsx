/**
 * SofascoreStatsPanel — displays Sofascore-sourced per-season aggregate
 * metrics that we can't get from API-Football or Flashscore. Includes the
 * detailed goal-type breakdown the user asked about (penalty / free kick /
 * inside box / outside box / footed / header).
 */

export interface SofascoreStatsPayload {
  [key: string]: string;
}

function parseFraction(value: string | undefined): { made: number; attempts: number } | null {
  if (!value) return null;
  const m = value.match(/^(\d+)\s*\/\s*(\d+)/);
  if (!m) return null;
  return { made: Number(m[1]), attempts: Number(m[2]) };
}

function parseInteger(value: string | undefined): number | null {
  if (!value) return null;
  const m = value.match(/^(\d+(?:\.\d+)?)/);
  if (!m) return null;
  return Number(m[1]);
}

function parsePercent(value: string | undefined): number | null {
  if (!value) return null;
  const m = value.match(/(\d+(?:\.\d+)?)%/);
  if (!m) return null;
  return Number(m[1]);
}

export function SofascoreStatsPanel({ payload }: { payload: SofascoreStatsPayload | null }) {
  if (!payload || Object.keys(payload).length === 0) {
    return <p className="text-sm text-stone-500">אין נתוני Sofascore עדכניים. ירוץ אוטומטית בסבב הסקרייפינג הבא.</p>;
  }

  const totalGoals = parseInteger(payload['Goals scored']) ?? 0;
  const penalty = parseFraction(payload['Penalty goals']);
  const freeKick = parseFraction(payload['Free kick goals']);
  const insideBox = parseFraction(payload['Goals from inside the box']);
  const outsideBox = parseFraction(payload['Goals from outside the box']);
  const leftFooted = parseInteger(payload['Left-footed goals']);
  const rightFooted = parseInteger(payload['Right-footed goals']);
  const headed = parseInteger(payload['Headed goals']);
  const counterAttacks = parseInteger(payload['Counter attacks']);
  const possession = parsePercent(payload['Ball possession']);
  const bigChances = parseInteger(payload['Big chances per game']);
  const cleanSheets = parseInteger(payload['Clean sheets']);
  const yellows = parseInteger(payload['Yellow cards']);
  const reds = parseInteger(payload['Red cards']);

  const goalTypes: Array<{ label: string; value: string; color: string }> = [];
  if (penalty) goalTypes.push({ label: 'פנדלים', value: `${penalty.made}/${penalty.attempts}`, color: 'bg-amber-500' });
  if (freeKick) goalTypes.push({ label: 'בעיטות חופשיות', value: `${freeKick.made}/${freeKick.attempts}`, color: 'bg-violet-500' });
  if (insideBox) goalTypes.push({ label: 'מתוך הרחבה', value: `${insideBox.made}`, color: 'bg-emerald-500' });
  if (outsideBox) goalTypes.push({ label: 'מחוץ לרחבה', value: `${outsideBox.made}`, color: 'bg-blue-500' });
  if (headed != null) goalTypes.push({ label: 'בראש', value: String(headed), color: 'bg-rose-500' });
  if (leftFooted != null) goalTypes.push({ label: 'רגל שמאל', value: String(leftFooted), color: 'bg-cyan-500' });
  if (rightFooted != null) goalTypes.push({ label: 'רגל ימין', value: String(rightFooted), color: 'bg-sky-500' });

  return (
    <div className="space-y-4">
      <p className="text-xs text-stone-500">
        סה&quot;כ {totalGoals} שערים בעונה
      </p>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
        {goalTypes.map((g) => (
          <div key={g.label} className="rounded-lg bg-stone-50 p-3 text-center">
            <div className={`mx-auto mb-1.5 h-2 w-10 rounded ${g.color}`} />
            <div className="text-xl font-black text-stone-900">{g.value}</div>
            <div className="text-[11px] font-bold text-stone-500">{g.label}</div>
          </div>
        ))}
      </div>

      <div className="border-t border-stone-100 pt-3">
        <h4 className="mb-2 text-xs font-bold text-stone-500">מדדים נוספים</h4>
        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
          {possession != null ? <KV k="החזקה" v={`${possession}%`} /> : null}
          {bigChances != null ? <KV k="הזדמנויות גדולות/משחק" v={String(bigChances)} /> : null}
          {counterAttacks != null ? <KV k="התקפות מתפרצות" v={String(counterAttacks)} /> : null}
          {cleanSheets != null ? <KV k="רשת נקייה" v={String(cleanSheets)} /> : null}
          {yellows != null ? <KV k="כרטיסים צהובים" v={String(yellows)} /> : null}
          {reds != null ? <KV k="כרטיסים אדומים" v={String(reds)} /> : null}
        </div>
      </div>
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-stone-50 px-2 py-1.5">
      <span className="text-stone-500">{k}</span>
      <span className="font-bold text-stone-900">{v}</span>
    </div>
  );
}
