import Link from 'next/link';
import type { Metadata } from 'next';
import { buildAllTimeTable, type AllTimeFilters } from '@/lib/history/all-time-table';
import { TeamLogo } from '@/components/MediaImage';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'טבלת כל הזמנים — ליגת העל | StatsAI',
  description: 'טבלת כל הזמנים של ליגת העל הישראלית — נקודות, ניצחונות והפרש שערים מצטברים לכל קבוצה מאז 1949.',
};

type Scope = 'all' | 'home' | 'away';

const SCOPE_OPTIONS: Array<{ value: Scope; label: string }> = [
  { value: 'all', label: 'הכל' },
  { value: 'home', label: 'בית' },
  { value: 'away', label: 'חוץ' },
];

const ERA_OPTIONS: Array<{ from?: number; to?: number; label: string }> = [
  { label: 'הכל' },
  { from: 2000, to: 2009, label: 'שנות ה-2000' },
  { from: 2010, to: 2019, label: 'שנות ה-2010' },
  { from: 2020, label: 'מ-2020' },
];

function buildHref(params: { scope?: string; from?: string; to?: string }): string {
  const usp = new URLSearchParams();
  if (params.scope && params.scope !== 'all') usp.set('scope', params.scope);
  if (params.from) usp.set('from', params.from);
  if (params.to) usp.set('to', params.to);
  const qs = usp.toString();
  return qs ? `/history/all-time?${qs}` : '/history/all-time';
}

export default async function AllTimeTablePage({
  searchParams,
}: {
  searchParams?: { from?: string; to?: string; scope?: string };
}) {
  const scopeParam = searchParams?.scope;
  const scope: Scope = scopeParam === 'home' || scopeParam === 'away' ? scopeParam : 'all';

  const fromYear = Number.isFinite(Number(searchParams?.from)) && searchParams?.from ? Number(searchParams.from) : undefined;
  const toYear = Number.isFinite(Number(searchParams?.to)) && searchParams?.to ? Number(searchParams.to) : undefined;

  const filters: AllTimeFilters = { scope, fromYear, toYear };
  const rows = await buildAllTimeTable(filters);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="border-r-[4px] border-[var(--accent)] pr-3 text-3xl font-black text-stone-900">טבלת כל הזמנים</h1>
      <p className="mt-2 text-sm text-stone-500">
        ליגת העל · {rows.length} קבוצות ·{' '}
        <Link href="/history/seasons" className="font-bold text-[var(--accent)]">כל העונות ←</Link>
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <div className="flex flex-wrap gap-1.5 rounded-full border border-stone-200 bg-white p-1 shadow-sm">
          {SCOPE_OPTIONS.map((opt) => {
            const active = opt.value === scope;
            return (
              <Link
                key={opt.value}
                href={buildHref({ scope: opt.value, from: searchParams?.from, to: searchParams?.to })}
                className={`rounded-full px-3 py-1 text-xs font-bold transition-colors ${
                  active ? 'bg-[var(--accent)] text-white' : 'text-stone-600 hover:bg-stone-100'
                }`}
              >
                {opt.label}
              </Link>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-1.5 rounded-full border border-stone-200 bg-white p-1 shadow-sm">
          {ERA_OPTIONS.map((era) => {
            const active = (era.from == null ? fromYear == null : fromYear === era.from) && (era.to == null ? toYear == null : toYear === era.to);
            return (
              <Link
                key={era.label}
                href={buildHref({ scope: searchParams?.scope, from: era.from ? String(era.from) : undefined, to: era.to ? String(era.to) : undefined })}
                className={`rounded-full px-3 py-1 text-xs font-bold transition-colors ${
                  active ? 'bg-[var(--accent)] text-white' : 'text-stone-600 hover:bg-stone-100'
                }`}
              >
                {era.label}
              </Link>
            );
          })}
        </div>
      </div>

      {scope !== 'all' ? (
        <p className="mt-3 text-xs text-stone-400">בית/חוץ מחושב ממשחקים — זמין מ-2000 ואילך</p>
      ) : null}

      {rows.length === 0 ? (
        <p className="mt-6 text-sm text-stone-500">אין נתונים להצגה.</p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-[24px] border border-stone-200 bg-white shadow-sm">
          <table className="w-full text-right text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-xs font-bold uppercase tracking-wider text-stone-500">
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">קבוצה</th>
                <th className="px-4 py-3">עונות</th>
                <th className="px-4 py-3">מש׳</th>
                <th className="px-4 py-3">נ</th>
                <th className="px-4 py-3">ת</th>
                <th className="px-4 py-3">ה</th>
                <th className="px-4 py-3">שערים</th>
                <th className="px-4 py-3">הפרש</th>
                <th className="px-4 py-3">נק׳</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={row.clubKey} className="border-b border-stone-100 last:border-0 hover:bg-stone-50">
                  <td className="px-4 py-3 text-stone-400">{idx + 1}</td>
                  <td className="px-4 py-3">
                    <Link href={`/teams/${row.latestTeamId}`} className="flex items-center gap-2 font-bold text-stone-900 hover:text-[var(--accent)]">
                      <TeamLogo
                        src={row.logoUrl}
                        alt={row.nameHe}
                        className="h-6 w-6 rounded-full object-contain"
                        fallbackClassName="flex h-6 w-6 items-center justify-center rounded-full bg-violet-100 text-[9px] font-black text-violet-700"
                      />
                      {row.nameHe}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-stone-700">{row.seasons}</td>
                  <td className="px-4 py-3 text-stone-700">{row.played}</td>
                  <td className="px-4 py-3 text-stone-700">{row.wins}</td>
                  <td className="px-4 py-3 text-stone-700">{row.draws}</td>
                  <td className="px-4 py-3 text-stone-700">{row.losses}</td>
                  <td className="px-4 py-3 text-stone-500">{row.goalsFor}:{row.goalsAgainst}</td>
                  <td className="px-4 py-3 text-stone-700">{row.goalsDiff > 0 ? `+${row.goalsDiff}` : row.goalsDiff}</td>
                  <td className="px-4 py-3 font-black text-stone-900">{row.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
