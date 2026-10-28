import Link from 'next/link';
import type { LastMatchSummary, MatchMoment } from '@/lib/last-match-summary';

const RESULT_CHIP: Record<LastMatchSummary['result'], { label: string; cls: string }> = {
  W: { label: 'ניצחון', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  D: { label: 'תיקו', cls: 'bg-stone-100 text-stone-700 ring-stone-200' },
  L: { label: 'הפסד', cls: 'bg-red-50 text-red-700 ring-red-200' },
};

const minuteLabel = (m: Pick<MatchMoment, 'minute' | 'extraMinute'>) => (m.extraMinute ? `${m.minute}+${m.extraMinute}` : `${m.minute}`);

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('');
}

function TeamCell({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-1.5 text-center">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt="" className="h-11 w-11 object-contain" />
      ) : (
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-stone-100 text-xs font-black text-stone-500">{initials(name)}</span>
      )}
      <span className="w-full truncate text-sm font-black text-stone-900">{name}</span>
    </div>
  );
}

/** Goals and red cards along the 90 minutes, right to left. The focus team sits above the line. */
function MomentsTimeline({ moments, focus }: { moments: MatchMoment[]; focus: 'home' | 'away' }) {
  if (!moments.length) return null;
  const end = Math.max(90, ...moments.map((m) => m.minute + (m.extraMinute ?? 0)));
  const pos = (m: MatchMoment) => `${Math.min(100, ((m.minute + (m.extraMinute ?? 0)) / end) * 100)}%`;
  return (
    <div className="mt-4">
      <div className="relative h-14" aria-hidden="true">
        <div className="absolute inset-x-0 top-[26px] h-1 rounded-full bg-stone-200" />
        <div className="absolute top-[20px] h-4 w-px bg-stone-300" style={{ right: `${(45 / end) * 100}%` }} />
        {moments.map((m, idx) => {
          const above = m.side === focus;
          const ours = m.side === focus;
          const dot =
            m.kind === 'red-card'
              ? 'h-3 w-2 rounded-[2px] bg-stone-900'
              : `h-3 w-3 rounded-full ring-2 ring-white ${ours ? 'bg-[var(--accent)]' : 'bg-stone-500'}`;
          return (
            <div
              key={idx}
              className={`absolute flex translate-x-1/2 flex-col items-center ${above ? 'top-0' : 'top-[22px]'}`}
              style={{ right: pos(m) }}
              title={`${minuteLabel(m)}׳ ${m.name ?? ''}`}
            >
              {above ? <span className="mb-0.5 text-[10px] font-black tabular-nums text-stone-600">{minuteLabel(m)}</span> : null}
              <span className={`block ${dot}`} />
              {!above ? <span className="mt-0.5 text-[10px] font-black tabular-nums text-stone-400">{minuteLabel(m)}</span> : null}
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-[10px] font-semibold text-stone-400">
        <span>פתיחה</span>
        <span>מחצית</span>
        <span>סיום</span>
      </div>
    </div>
  );
}

/** "זלאטנוביץ׳ 50׳, 56׳ (פ׳)" — one line per player, in the order they first scored. */
function ScorerList({ moments, side }: { moments: MatchMoment[]; side: 'home' | 'away' }) {
  const lines = new Map<string, string[]>();
  const reds: string[] = [];
  for (const m of moments.filter((x) => x.side === side)) {
    if (m.kind === 'red-card') { reds.push(`${m.name ?? 'אדום'} ${minuteLabel(m)}׳`); continue; }
    const who = m.kind === 'own-goal' ? 'שער עצמי' : m.name ?? 'שער';
    const tag = m.kind === 'penalty' ? ` (פ׳)` : '';
    lines.set(who, [...(lines.get(who) ?? []), `${minuteLabel(m)}׳${tag}`]);
  }
  if (!lines.size && !reds.length) return <div />;
  return (
    <ul className="min-w-0 space-y-0.5 text-[12px] leading-5 text-stone-600">
      {[...lines].map(([who, mins]) => (
        <li key={who} className="truncate"><span className="font-bold text-stone-800">⚽ {who}</span> {mins.join(', ')}</li>
      ))}
      {reds.map((r) => (
        <li key={r} className="truncate"><span className="inline-block h-2.5 w-2 rounded-[1px] bg-red-600 align-middle" /> {r}</li>
      ))}
    </ul>
  );
}

export function LastMatchCard({ summary, dateLabel }: { summary: LastMatchSummary; dateLabel: string }) {
  const chip = RESULT_CHIP[summary.result];
  const meta = [summary.competitionName, summary.roundLabel, dateLabel].filter(Boolean).join(' · ');
  const focusName = summary.focus === 'home' ? summary.home.name : summary.away.name;
  const otherName = summary.focus === 'home' ? summary.away.name : summary.home.name;
  const pom = summary.playerOfMatch;
  return (
    <section className="modern-card rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="border-r-[3px] border-[var(--accent)] pr-3 text-base font-black text-stone-900">משחק אחרון</h2>
        <span className="truncate text-[11px] text-stone-400">{meta}</span>
      </div>

      <div className="flex items-start gap-2">
        <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-black ring-1 ${chip.cls}`}>{chip.label}</span>
        <p className="text-[17px] font-black leading-6 text-stone-900 [text-wrap:balance]">{summary.headline}</p>
      </div>

      <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
        <TeamCell name={summary.home.name} logoUrl={summary.home.logoUrl} />
        <div className="flex items-center gap-2 rounded-xl bg-stone-900 px-4 py-2 text-3xl font-black tabular-nums text-white">
          <span>{summary.home.score}</span><span className="text-white/30">–</span><span>{summary.away.score}</span>
        </div>
        <TeamCell name={summary.away.name} logoUrl={summary.away.logoUrl} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <ScorerList moments={summary.moments} side="home" />
        <ScorerList moments={summary.moments} side="away" />
      </div>

      <MomentsTimeline moments={summary.moments} focus={summary.focus} />
      {summary.moments.length ? (
        <div className="mt-1 flex flex-wrap justify-center gap-x-3 text-[10px] text-stone-400">
          <span><span className="inline-block h-2 w-2 rounded-full bg-[var(--accent)]" /> {focusName} מעל הקו</span>
          <span><span className="inline-block h-2 w-2 rounded-full bg-stone-500" /> {otherName} מתחת</span>
        </div>
      ) : null}

      {summary.duels.length ? (
        <div className="mt-4 space-y-2.5 border-t border-stone-100 pt-4">
          {summary.duels.map((d) => {
            const total = d.home + d.away;
            const homeShare = total > 0 ? (d.home / total) * 100 : 50;
            const fmt = (v: number) => `${v}${d.unit ?? ''}`;
            return (
              <div key={d.label}>
                <div className="mb-1 flex items-center justify-between text-[12px]">
                  <b className="tabular-nums text-stone-900">{fmt(d.home)}</b>
                  <span className="text-stone-500">{d.label}</span>
                  <b className="tabular-nums text-stone-900">{fmt(d.away)}</b>
                </div>
                <div className="flex h-1.5 overflow-hidden rounded-full bg-stone-200">
                  <i className={`block ${summary.focus === 'home' ? 'bg-[var(--accent)]' : 'bg-stone-400'}`} style={{ width: `${homeShare}%` }} />
                  <i className={`block flex-1 ${summary.focus === 'away' ? 'bg-[var(--accent)]' : 'bg-stone-300'}`} />
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {pom ? (
        <Link href={`/players/${pom.id}`} className="mt-4 flex items-center gap-3 rounded-xl bg-stone-50 p-2.5 transition hover:bg-stone-100">
          {pom.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={pom.photoUrl} alt="" className="h-10 w-10 rounded-full border border-stone-200 bg-white object-cover object-top" />
          ) : (
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-xs font-black text-amber-800">{initials(pom.name)}</span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-semibold text-stone-500">שחקן המשחק</span>
            <span className="block truncate text-sm font-black text-stone-900">{pom.name}</span>
          </span>
          <span className="rounded-md bg-emerald-600 px-2 py-0.5 text-sm font-black tabular-nums text-white">{pom.rating.toFixed(1)}</span>
        </Link>
      ) : null}

      <Link
        href={`/games/${summary.id}`}
        className="mt-4 flex w-full items-center justify-center rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-black text-white transition hover:opacity-90"
      >
        לכל פרטי המשחק ←
      </Link>
    </section>
  );
}
