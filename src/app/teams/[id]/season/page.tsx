import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PlayerPhoto, TeamLogo } from '@/components/MediaImage';
import { GoalTimingChart, PointsProgressionChart } from '@/components/TeamSeasonCharts';
import {
  buildTeamSeasonSnapshot, TIMING_BUCKETS, type ControlBlock, type Duel, type GameLine, type PlayerLine, type Record3,
} from '@/lib/team-season-snapshot';

export const dynamic = 'force-dynamic';

const RESULT_STYLE: Record<GameLine['result'], string> = {
  W: 'bg-emerald-500 text-white', D: 'bg-stone-300 text-stone-800', L: 'bg-rose-500 text-white',
};
const RESULT_HE: Record<GameLine['result'], string> = { W: 'נ', D: 'ת', L: 'ה' };

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="modern-card rounded-2xl border border-stone-200/80 bg-white p-6 shadow-sm">
      <h2 className="border-r-[3px] border-[var(--accent)] pr-3 text-xl font-black text-stone-900">{title}</h2>
      {subtitle ? <p className="mt-1 text-sm text-stone-500">{subtitle}</p> : null}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm">
      <div className="text-xs font-bold tracking-[0.18em] text-stone-400">{label}</div>
      <div className="mt-2 text-3xl font-black text-stone-900">{value}</div>
      {sub ? <div className="mt-1 text-sm text-stone-500">{sub}</div> : null}
    </div>
  );
}

const recordLine = (r: Record3) => `${r.wins}-${r.draws}-${r.losses}`;

/** One stat as a split bar: our share in the club colour, theirs in grey. */
function DuelBar({ label, duel, unit = '' }: { label: string; duel: Duel; unit?: string }) {
  if (duel.us === null || duel.them === null) return null;
  const total = duel.us + duel.them || 1;
  const share = Math.round((100 * duel.us) / total);
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <span className="font-black text-stone-900">{duel.us}{unit}</span>
        <span className="font-semibold text-stone-500">{label}</span>
        <span className="font-bold text-stone-500">{duel.them}{unit}</span>
      </div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-stone-200" dir="rtl">
        <div className="bg-[var(--accent)]" style={{ width: `${share}%` }} />
      </div>
    </div>
  );
}

function ControlCard({ title, c }: { title: string; c: ControlBlock }) {
  const insight = c.insight;
  return (
    <Card title={title} subtitle={`ממוצע למשחק · ${c.possession.games} משחקים`}>
      <div className="mb-3 flex justify-between text-xs font-bold text-stone-400"><span>אנחנו</span><span>יריבות</span></div>
      <div className="space-y-4">
        <DuelBar label="החזקת כדור" duel={c.possession} unit="%" />
        <DuelBar label="בעיטות" duel={c.shots} />
        <DuelBar label="בעיטות למסגרת" duel={c.shotsOnTarget} />
        <DuelBar label="הזדמנויות גדולות" duel={c.bigChances} />
        <DuelBar label="נגיעות ברחבת היריב" duel={c.boxTouches} />
        <DuelBar label="xG (שערים צפויים)" duel={c.xg} />
      </div>
      {insight ? <p className="mt-5 rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">{insight}</p> : null}
      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-stone-50 p-4 text-center">
          <div className="text-2xl font-black text-stone-900">{c.conversion ?? '-'}%</div>
          <div className="mt-1 text-xs font-semibold text-stone-500">מהבעיטות למסגרת נכנסות</div>
        </div>
        <div className="rounded-xl bg-stone-50 p-4 text-center">
          <div className="text-2xl font-black text-stone-900">{c.savePct ?? '-'}%</div>
          <div className="mt-1 text-xs font-semibold text-stone-500">הצלות מהבעיטות למסגרת</div>
        </div>
      </div>
    </Card>
  );
}

function PlayerList({ rows, unit, empty }: { rows: PlayerLine[]; unit: string; empty: string }) {
  if (!rows.length) return <p className="text-sm text-stone-400">{empty}</p>;
  return (
    <ol className="space-y-3">
      {rows.slice(0, 6).map((r, i) => (
        <li key={r.playerId}>
          <Link href={`/players/${r.playerId}`} className="group flex items-center gap-3">
            <span className="w-4 text-sm font-black text-stone-400">{i + 1}</span>
            <PlayerPhoto
              src={r.photoUrl}
              alt={r.name}
              className="h-11 w-11 shrink-0 rounded-full border border-stone-200 bg-white object-cover object-top"
            />
            <div className="min-w-0 flex-1">
              <div className="truncate font-black text-stone-900 group-hover:text-[var(--accent)]">{r.name}</div>
              <div className="text-xs text-stone-500">{r.games} משחקים{r.detail ? ` · ${r.detail}` : ''}</div>
            </div>
            <span className="text-2xl font-black text-[var(--accent)]">{r.value}</span>
            <span className="w-10 text-xs text-stone-400">{unit}</span>
          </Link>
        </li>
      ))}
    </ol>
  );
}

function FirstGoalCard({ title, lines }: { title: string; lines: GameLine[] }) {
  const w = lines.filter((l) => l.result === 'W').length;
  const d = lines.filter((l) => l.result === 'D').length;
  const l = lines.length - w - d;
  return (
    <div className="rounded-2xl border border-stone-200/80 bg-stone-50 p-5">
      <div className="text-sm font-bold text-stone-500">{title}</div>
      <div className="mt-1 text-3xl font-black text-stone-900">{lines.length ? `${w}-${d}-${l}` : '-'}</div>
      <div className="text-xs text-stone-400">ניצחונות-תיקו-הפסדים · {lines.length} משחקים</div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {lines.map((g) => (
          <Link key={g.id} href={`/games/${g.id}`} title={`${g.opponentName} ${g.goalsFor}-${g.goalsAgainst}`}
            className={`rounded-full px-2.5 py-1 text-xs font-bold ${RESULT_STYLE[g.result]}`}>
            {g.goalsFor}-{g.goalsAgainst} {g.opponentName}
          </Link>
        ))}
      </div>
    </div>
  );
}

export default async function TeamSeasonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await buildTeamSeasonSnapshot(id);
  if (!s) notFound();

  const totalConceded = s.timing.conceded.reduce((a, b) => a + b, 0);
  const lateConceded = s.timing.conceded[5];
  const totalScored = s.timing.scored.reduce((a, b) => a + b, 0);
  const secondHalfScored = s.timing.scored[3] + s.timing.scored[4] + s.timing.scored[5];
  const scoredFirst = s.lines.filter((l) => l.firstGoal === 'us');
  const concededFirst = s.lines.filter((l) => l.firstGoal === 'them');

  return (
    <div dir="rtl" className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <div>
        <Link href={`/teams/${s.team.id}`} className="text-sm font-semibold text-stone-500 hover:text-[var(--accent)]">→ לדף הקבוצה</Link>
      </div>

      {/* Hero */}
      <section className="hero-featured-match overflow-hidden rounded-2xl p-6 text-white">
        <div className="flex flex-wrap items-center gap-5">
          <TeamLogo src={s.team.logoUrl} alt={s.team.nameHe} className="h-20 w-20 rounded-full bg-white object-contain p-1.5" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-white/70">תמונת עונה · {s.seasonName}</div>
            <h1 className="text-4xl font-black">{s.team.nameHe}</h1>
            {s.standing ? (
              <div className="mt-2 text-sm font-semibold text-white/85">
                מקום {s.standing.position} ב{s.leagueName} · {s.standing.points} נקודות
                {s.standing.leaderName ? ` · ${s.standing.gapToLeader} מאחורי ${s.standing.leaderName}` : ' · בראש הטבלה'}
              </div>
            ) : null}
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-1.5">
          {s.lines.map((g) => (
            <Link key={g.id} href={`/games/${g.id}`} title={`${g.date} · ${g.competitionName} · ${g.home ? 'נגד' : 'אצל'} ${g.opponentName} ${g.goalsFor}-${g.goalsAgainst}`}
              className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-black shadow ${RESULT_STYLE[g.result]}`}>
              {RESULT_HE[g.result]}
            </Link>
          ))}
        </div>
      </section>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="משחקים רשמיים" value={recordLine(s.competitive)} sub={`${s.competitive.played} משחקים · נ-ת-ה`} />
        <Kpi label="שערים" value={`${s.competitive.goalsFor}:${s.competitive.goalsAgainst}`} sub="זכות:חובה בכל המסגרות" />
        <Kpi label="שערים נקיים" value={String(s.competitive.cleanSheets)} sub={`לא כבשה ב-${s.competitive.failedToScore} משחקים`} />
        <Kpi
          label="בית / חוץ בליגה"
          value={s.leagueHome && s.leagueAway ? `${recordLine(s.leagueHome)} | ${recordLine(s.leagueAway)}` : '-'}
          sub={s.leagueHome && s.leagueAway ? `בית ${s.leagueHome.goalsFor}:${s.leagueHome.goalsAgainst} · חוץ ${s.leagueAway.goalsFor}:${s.leagueAway.goalsAgainst}` : undefined}
        />
      </div>

      {/* By competition */}
      <Card title="לפי מסגרת">
        <div className="overflow-x-auto">
          <table className="min-w-full text-right text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-xs text-stone-500">
                <th className="px-3 py-2 font-bold">מסגרת</th>
                <th className="px-3 py-2 text-center font-bold">משחקים</th>
                <th className="px-3 py-2 text-center font-bold">נ-ת-ה</th>
                <th className="px-3 py-2 text-center font-bold">שערים</th>
                <th className="px-3 py-2 text-center font-bold">נקיים</th>
              </tr>
            </thead>
            <tbody>
              {s.byCompetition.map((c) => (
                <tr key={c.id} className="border-b border-stone-100 last:border-0">
                  <td className="px-3 py-3 font-bold text-stone-900">{c.name}</td>
                  <td className="px-3 py-3 text-center">{c.record.played}</td>
                  <td className="px-3 py-3 text-center font-semibold">{recordLine(c.record)}</td>
                  <td className="px-3 py-3 text-center">{c.record.goalsFor}:{c.record.goalsAgainst}</td>
                  <td className="px-3 py-3 text-center">{c.record.cleanSheets}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Control vs quality */}
      <div className="grid gap-6 lg:grid-cols-2">
        {s.leagueControl ? <ControlCard title={`שליטה מול איכות — ${s.leagueName}`} c={s.leagueControl} /> : null}
        {s.europeControl ? <ControlCard title="שליטה מול איכות — אירופה" c={s.europeControl} /> : null}
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="מתי השערים נופלים" subtitle="כל המסגרות · לפי רבעי שעה">
          <GoalTimingChart buckets={TIMING_BUCKETS} scored={s.timing.scored} conceded={s.timing.conceded} />
          <div className="mt-3 space-y-1 text-sm text-stone-600">
            {totalConceded >= 5 && lateConceded / totalConceded >= 0.3 ? (
              <p className="font-semibold text-rose-700">
                {lateConceded} מתוך {totalConceded} שערי החובה ({Math.round((100 * lateConceded) / totalConceded)}%) נספגו מהדקה ה-76 והלאה.
              </p>
            ) : null}
            {totalScored >= 5 ? <p>{secondHalfScored} מתוך {totalScored} שערי הזכות במחצית השנייה.</p> : null}
            {s.timing.coverage < 0.95 ? <p className="text-xs text-stone-400">לחלק מהשערים אין דקה ידועה ({Math.round(100 * s.timing.coverage)}% מכוסים).</p> : null}
          </div>
        </Card>
        {s.leaguePoints.length > 1 ? (
          <Card title={`צבירת נקודות — ${s.leagueName}`} subtitle="מול קצב של ניצחון בכל משחק">
            <PointsProgressionChart points={s.leaguePoints} />
          </Card>
        ) : null}
      </div>

      {/* First goal */}
      <Card title="השער הראשון" subtitle="איך נגמרים המשחקים לפי מי שכבשה ראשונה · כל המסגרות">
        <div className="grid gap-4 md:grid-cols-2">
          <FirstGoalCard title="כשכובשת ראשונה" lines={scoredFirst} />
          <FirstGoalCard title="כשסופגת ראשונה" lines={concededFirst} />
        </div>
      </Card>

      {/* Players */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="כובשים" subtitle="כל המסגרות"><PlayerList rows={s.scorers} unit="שערים" empty="אין עדיין שערים משויכים." /></Card>
        <Card title="מבשלים" subtitle="כל המסגרות"><PlayerList rows={s.assisters} unit="בישולים" empty="אין עדיין בישולים משויכים." /></Card>
        <Card title="ציון ממוצע" subtitle="FotMob · משחקים של 30 דקות ומעלה"><PlayerList rows={s.ratings} unit="ציון" empty="אין מספיק משחקים מדורגים." /></Card>
      </div>

      {/* Games */}
      <Card title="המשחקים">
        <div className="overflow-x-auto">
          <table className="min-w-full text-right text-sm">
            <tbody>
              {[...s.lines].reverse().map((g) => (
                <tr key={g.id} className="border-b border-stone-100 last:border-0 hover:bg-stone-50">
                  <td className="px-3 py-3 text-stone-500">{g.date}</td>
                  <td className="px-3 py-3 text-stone-500">{g.competitionName}{g.roundLabel ? ` · ${g.roundLabel}` : ''}</td>
                  <td className="px-3 py-3">
                    <Link href={`/games/${g.id}`} className="flex items-center gap-2 font-bold text-stone-900 hover:text-[var(--accent)]">
                      <TeamLogo src={g.opponentLogo} alt={g.opponentName} className="h-6 w-6 object-contain" fallbackClassName="flex h-6 w-6 items-center justify-center rounded-full bg-stone-100 text-[9px] font-black text-stone-500" />
                      {g.home ? 'נגד' : 'אצל'} {g.opponentName}
                    </Link>
                  </td>
                  <td className="px-3 py-3 text-center" dir="ltr">
                    <span className={`rounded-full px-3 py-1 text-xs font-black ${RESULT_STYLE[g.result]}`}>{g.goalsFor}-{g.goalsAgainst}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
