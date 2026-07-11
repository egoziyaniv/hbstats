import Link from 'next/link';
import type { Metadata } from 'next';
import prisma from '@/lib/prisma';
import { RECORD_CATEGORIES } from '@/lib/history/records-engine';
import { getCurrentLeagueClubFamilies } from '@/lib/history/club-identity';
import { TeamLogo } from '@/components/MediaImage';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'ספר השיאים — כל ההיסטוריה | StatsAI',
  description: 'השיאים הגדולים של ליגת העל הישראלית — הניצחון הגדול ביותר, השער המהיר ביותר, הרצפים הארוכים ביותר ועוד.',
};

function buildHref(params: { cat?: string; club?: string }): string {
  const usp = new URLSearchParams();
  if (params.cat) usp.set('cat', params.cat);
  if (params.club) usp.set('club', params.club);
  const qs = usp.toString();
  return `/history/records${qs ? `?${qs}` : ''}`;
}

// Date-only display, string-derived — never toLocaleDateString (locale/TZ
// dependent and can shift the day). Mirrors the engine's own formatHeDate.
function formatHeDate(d: Date): string {
  const [y, m, day] = d.toISOString().slice(0, 10).split('-');
  return `${Number(day)}.${Number(m)}.${y}`;
}

type RecordRow = {
  id: string;
  rank: number;
  labelHe: string;
  detailHe: string | null;
  playerId: string | null;
  gameId: string | null;
  computedAt: Date;
  category: string;
};

function RecordRows({ rows }: { rows: RecordRow[] }) {
  return (
    <div className="overflow-hidden rounded-[24px] border border-stone-200 bg-white shadow-sm">
      {rows.map((row, i) => (
        <div
          key={row.id}
          className={`flex items-center gap-4 px-4 py-3 ${i === rows.length - 1 ? '' : 'border-b border-stone-100'}`}
        >
          <span className="w-6 shrink-0 text-center text-sm font-black text-stone-400">{row.rank}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold text-stone-900">
              {row.playerId ? (
                <Link href={`/players/${row.playerId}`} className="hover:text-[var(--accent)]">{row.labelHe}</Link>
              ) : row.gameId ? (
                <Link href={`/games/${row.gameId}`} className="hover:text-[var(--accent)]">{row.labelHe}</Link>
              ) : (
                row.labelHe
              )}
            </p>
            {row.detailHe ? <p className="mt-0.5 truncate text-xs text-stone-500">{row.detailHe}</p> : null}
          </div>
        </div>
      ))}
    </div>
  );
}

export default async function RecordsPage({
  searchParams,
}: {
  searchParams?: { cat?: string; club?: string };
}) {
  const catParam = searchParams?.cat;
  const clubParam = typeof searchParams?.club === 'string' ? searchParams.club : undefined;

  // Club filter: current Ligat Ha'al clubs only (the record book's club picker
  // deliberately offers top-flight clubs, not all 300+ historical families).
  const leagueClubs = await getCurrentLeagueClubFamilies();
  const activeClub = clubParam ? leagueClubs.find((f) => f.clubKey === clubParam) ?? null : null;

  if (activeClub) {
    // Club mode: the club's whole record book, stacked by category (top-5 each).
    const clubRows = (await prisma.recordEntry.findMany({
      where: { scope: `club:${activeClub.clubKey}` },
      orderBy: { rank: 'asc' },
    })) as RecordRow[];
    const groups = RECORD_CATEGORIES
      .map((cat) => ({ cat, rows: clubRows.filter((r) => r.category === cat.key) }))
      .filter((g) => g.rows.length > 0);
    const latestComputedAt = clubRows.reduce<Date | null>(
      (max, r) => (!max || r.computedAt > max ? r.computedAt : max),
      null,
    );

    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <RecordsHeader />
        <ClubChips leagueClubs={leagueClubs} activeClubKey={activeClub.clubKey} />
        <h2 className="mt-6 flex items-center gap-2 text-lg font-black text-stone-900">
          <TeamLogo
            src={activeClub.logoUrl}
            alt={activeClub.nameHe}
            className="h-7 w-7 rounded-full object-contain"
            fallbackClassName="flex h-7 w-7 items-center justify-center rounded-full bg-violet-100 text-[10px] font-black text-violet-700"
          />
          השיאים של {activeClub.nameHe}
        </h2>
        {groups.length === 0 ? (
          <p className="mt-4 text-sm text-stone-500">אין עדיין שיאים לקבוצה זו — ייתכן שספר השיאים טרם נבנה מחדש.</p>
        ) : (
          <div className="mt-4 space-y-6">
            {groups.map(({ cat, rows }) => (
              <section key={cat.key}>
                <h3 className="mb-2 text-sm font-black uppercase tracking-wider text-stone-500">{cat.titleHe}</h3>
                <RecordRows rows={rows} />
              </section>
            ))}
          </div>
        )}
        <Footnotes latestComputedAt={latestComputedAt} showStreakNote />
      </div>
    );
  }

  // League mode (default): one category at a time via pills.
  const activeCategory = RECORD_CATEGORIES.find((c) => c.key === catParam) ?? RECORD_CATEGORIES[0];
  const rows = activeCategory
    ? ((await prisma.recordEntry.findMany({
        where: { category: activeCategory.key, scope: 'league' },
        orderBy: { rank: 'asc' },
      })) as RecordRow[])
    : [];
  const latestComputedAt = rows.reduce<Date | null>(
    (max, r) => (!max || r.computedAt > max ? r.computedAt : max),
    null,
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <RecordsHeader />
      <ClubChips leagueClubs={leagueClubs} activeClubKey={null} />

      <div className="mt-4 flex flex-wrap gap-1.5 rounded-[20px] border border-stone-200 bg-white p-1.5 shadow-sm">
        {RECORD_CATEGORIES.map((cat) => {
          const active = cat.key === activeCategory?.key;
          return (
            <Link
              key={cat.key}
              href={buildHref({ cat: cat.key })}
              className={`rounded-full px-3 py-1 text-xs font-bold transition-colors ${
                active ? 'bg-[var(--accent)] text-white' : 'text-stone-600 hover:bg-stone-100'
              }`}
            >
              {cat.titleHe}
            </Link>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <p className="mt-6 text-sm text-stone-500">ספר השיאים טרם נבנה — הריצו עדכון מהאדמין.</p>
      ) : (
        <div className="mt-6">
          <RecordRows rows={rows} />
        </div>
      )}

      <Footnotes
        latestComputedAt={latestComputedAt}
        showEventNote={activeCategory?.eventBased}
        showStreakNote={activeCategory?.ordered}
      />
    </div>
  );
}

function RecordsHeader() {
  return (
    <>
      <h1 className="border-r-[4px] border-[var(--accent)] pr-3 text-3xl font-black text-stone-900">ספר השיאים</h1>
      <p className="mt-2 text-sm text-stone-500">
        השיאים הגדולים של ליגת העל הישראלית ·{' '}
        <Link href="/history/seasons" className="font-bold text-[var(--accent)]">כל העונות ←</Link>
        {' · '}
        <Link href="/history/all-time" className="font-bold text-[var(--accent)]">טבלת כל הזמנים ←</Link>
      </p>
    </>
  );
}

function ClubChips({
  leagueClubs,
  activeClubKey,
}: {
  leagueClubs: Awaited<ReturnType<typeof getCurrentLeagueClubFamilies>>;
  activeClubKey: string | null;
}) {
  if (leagueClubs.length === 0) return null;
  return (
    <div className="mt-6">
      <p className="mb-2 text-xs font-bold uppercase tracking-wider text-stone-400">סינון לפי קבוצה (ליגת העל)</p>
      <div className="flex flex-wrap gap-1.5">
        <Link
          href={buildHref({})}
          className={`rounded-full border px-3 py-1 text-xs font-bold transition-colors ${
            activeClubKey === null
              ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
              : 'border-stone-200 bg-white text-stone-600 hover:border-[var(--accent)]'
          }`}
        >
          כל הליגה
        </Link>
        {leagueClubs.map((f) => (
          <Link
            key={f.clubKey}
            href={buildHref({ club: f.clubKey })}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold transition-colors ${
              activeClubKey === f.clubKey
                ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                : 'border-stone-200 bg-white text-stone-600 hover:border-[var(--accent)]'
            }`}
          >
            <TeamLogo
              src={f.logoUrl}
              alt={f.nameHe}
              className="h-4 w-4 rounded-full object-contain"
              fallbackClassName="flex h-4 w-4 items-center justify-center rounded-full bg-violet-100 text-[7px] font-black text-violet-700"
            />
            {f.nameHe}
          </Link>
        ))}
      </div>
    </div>
  );
}

function Footnotes({
  latestComputedAt,
  showEventNote,
  showStreakNote,
}: {
  latestComputedAt: Date | null;
  showEventNote?: boolean;
  showStreakNote?: boolean;
}) {
  return (
    <div className="mt-4 space-y-1 text-xs text-stone-400">
      {latestComputedAt ? <p>עודכן: {formatHeDate(latestComputedAt)}</p> : null}
      {showEventNote ? <p>נתוני אירועים מ-2006 ואילך</p> : null}
      {showStreakNote ? <p>רצפים מחושבים מעונות עם תאריכי משחק מלאים</p> : null}
    </div>
  );
}
