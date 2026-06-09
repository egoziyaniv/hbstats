import Link from 'next/link';
import SmartFilterForm from '@/components/SmartFilterForm';
import prisma from '@/lib/prisma';
import { TeamLogo } from '@/components/MediaImage';

export const dynamic = 'force-dynamic';

const DEFAULT_COMPETITION_ID = 'comp_liga_haal';

export default async function TeamsPage({
  searchParams,
}: {
  searchParams?: { season?: string; competitionId?: string };
}) {
  const seasons = await prisma.season.findMany({ orderBy: { year: 'desc' } });
  const selectedSeasonId =
    searchParams?.season || seasons.find((s) => s.year <= 2025)?.id || seasons[0]?.id;
  const selectedSeason = seasons.find((s) => s.id === selectedSeasonId) || seasons[0] || null;
  const selectedCompetitionId = searchParams?.competitionId || DEFAULT_COMPETITION_ID;
  const filterByCompetition = selectedCompetitionId !== 'all';

  const competitions = await prisma.competition.findMany({
    select: { id: true, nameHe: true, nameEn: true },
    orderBy: { nameHe: 'asc' },
  });

  // Teams that play in the selected competition this season (derived from games).
  const competitionTeamIds =
    filterByCompetition && selectedSeason
      ? new Set(
          (
            await prisma.game.findMany({
              where: { seasonId: selectedSeason.id, competitionId: selectedCompetitionId },
              select: { homeTeamId: true, awayTeamId: true },
            })
          ).flatMap((g) => [g.homeTeamId, g.awayTeamId]),
        )
      : null;
  // Fall back to all season teams when the competition has no game data (old seasons).
  const useCompFilter = !!competitionTeamIds && competitionTeamIds.size > 0;

  const teams = selectedSeason
    ? await prisma.team.findMany({
        where: {
          seasonId: selectedSeason.id,
          ...(useCompFilter ? { id: { in: Array.from(competitionTeamIds!) } } : {}),
        },
        select: {
          id: true,
          nameHe: true,
          nameEn: true,
          logoUrl: true,
          cityHe: true,
          cityEn: true,
          stadiumHe: true,
        },
        orderBy: [{ nameHe: 'asc' }, { nameEn: 'asc' }],
      })
    : [];

  const selectClass =
    'rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm font-semibold text-stone-900 focus:outline-none';
  const fields = [
    {
      name: 'season',
      options: seasons.map((s) => ({ value: s.id, label: s.name })),
      className: selectClass,
    },
    {
      name: 'competitionId',
      includeAllOption: true,
      allLabel: 'כל המסגרות',
      options: competitions.map((c) => ({ value: c.id, label: c.nameHe || c.nameEn })),
      className: selectClass,
    },
  ];

  return (
    <div dir="rtl" className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="modern-card rounded-2xl border border-stone-200/80 bg-white p-6 shadow-sm md:p-8">
          <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-[var(--accent)]">קבוצות</p>
          <h1 className="mt-2 text-3xl font-black text-stone-900 md:text-4xl">מרכז הקבוצות</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
            כל הקבוצות בעונה ובמסגרת שנבחרו. לחיצה על קבוצה פותחת את הסגל, המשחקים, הסטטיסטיקות והשופטים.
          </p>

          <SmartFilterForm
            action="/teams"
            fields={fields}
            initialValues={{
              season: selectedSeason?.id || '',
              competitionId: selectedCompetitionId,
            }}
            formClassName="mt-6 grid gap-3 md:grid-cols-[1fr_1fr_auto]"
            buttonClassName="rounded-xl bg-[var(--accent)] px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90"
            submitLabel="הצג"
          />
          <p className="mt-3 text-xs font-semibold text-stone-400">{teams.length} קבוצות</p>
        </section>

        {teams.length > 0 ? (
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {teams.map((team) => {
              const name = team.nameHe || team.nameEn;
              const city = team.cityHe || team.cityEn || team.stadiumHe || null;
              return (
                <Link
                  key={team.id}
                  href={`/teams/${team.id}`}
                  className="modern-card flex items-center gap-4 rounded-xl border border-stone-200/80 bg-white p-5 shadow-sm transition hover:border-[var(--accent)]/30 hover:shadow-md"
                >
                  <TeamLogo
                    src={team.logoUrl}
                    alt={name}
                    className="h-14 w-14 shrink-0 rounded-full border border-stone-200 bg-stone-50 object-contain p-1"
                    fallbackClassName="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[var(--accent-glow)] text-sm font-black text-[var(--accent-text)]"
                  />
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-black text-stone-900">{name}</h2>
                    {city ? <div className="mt-0.5 truncate text-sm text-stone-500">{city}</div> : null}
                  </div>
                </Link>
              );
            })}
          </section>
        ) : (
          <section className="rounded-xl border border-stone-200 bg-white p-8 text-center text-sm text-stone-500">
            לא נמצאו קבוצות לעונה / המסגרת שנבחרו.
          </section>
        )}
      </div>
    </div>
  );
}
