import { Prisma } from '@prisma/client';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import SmartFilterForm from '@/components/SmartFilterForm';
import { getDisplayMode } from '@/lib/display-mode';
import prisma from '@/lib/prisma';
import { gameDateLabel } from '@/lib/game-date';
import { getCompetitionDisplayName, getGameScoreDisplay, getRoundDisplayName } from '@/lib/competition-display';
import { formatPlayerName } from '@/lib/player-display';

export const dynamic = 'force-dynamic';

const eventLabels: Record<string, string> = {
  GOAL: 'שער',
  ASSIST: 'בישול',
  YELLOW_CARD: 'כרטיס צהוב',
  RED_CARD: 'כרטיס אדום',
  SUBSTITUTION_IN: 'חילוף נכנס',
  SUBSTITUTION_OUT: 'חילוף יוצא',
  OWN_GOAL: 'שער עצמי',
  PENALTY_GOAL: 'פנדל',
  PENALTY_MISSED: 'פנדל מוחמץ',
};

export default async function GamesPage({
  searchParams: searchParamsPromise,
}: {
  searchParams?: Promise<{
    season?: string;
    competitionId?: string;
    round?: string;
    teamId?: string;
    view?: string;
    layout?: string;
  }>;
}) {
  const searchParams = await searchParamsPromise;
  // 'cards' = the whole season as a grid of game cards in date order; default is the list.
  const layout = searchParams?.layout === 'cards' ? 'cards' : 'list';
  const displayMode = await getDisplayMode(searchParams?.view);
  const currentUser = await getCurrentUser();
  const seasons = await prisma.season.findMany({
    orderBy: { year: 'desc' },
  });
  const seasonIds = seasons.map((season) => season.id);
  const [allFilterTeams, allFilterGames] = seasonIds.length
    ? await Promise.all([
        prisma.team.findMany({
          where: { seasonId: { in: seasonIds } },
          select: { id: true, seasonId: true, nameHe: true, nameEn: true },
          orderBy: [{ nameHe: 'asc' }, { nameEn: 'asc' }],
        }),
        prisma.game.findMany({
          where: { seasonId: { in: seasonIds } },
          select: {
            seasonId: true,
            competitionId: true,
            roundNameHe: true,
            roundNameEn: true,
            homeTeamId: true,
            awayTeamId: true,
            competition: {
              select: {
                id: true,
                nameHe: true,
                nameEn: true,
              },
            },
          },
        }),
      ])
    : [[], []];

  // Default to the newest season that actually HAS games — skips empty future
  // seasons (e.g. a premature "2027-2028" API artifact) that would otherwise
  // become the default and show an empty list.
  const seasonIdsWithGames = new Set(allFilterGames.map((game) => game.seasonId));
  const defaultSeason = seasons.find((season) => seasonIdsWithGames.has(season.id)) || seasons[0] || null;
  const selectedSeasonId = searchParams?.season || defaultSeason?.id || null;
  const selectedSeason = seasons.find((season) => season.id === selectedSeasonId) || defaultSeason || null;

  const competitions = selectedSeason
    ? await prisma.competition.findMany({
        where: {
          games: {
            some: {
              seasonId: selectedSeason.id,
            },
          },
        },
        orderBy: [{ nameHe: 'asc' }, { nameEn: 'asc' }],
      })
    : [];

  const teams = selectedSeason
    ? await prisma.team.findMany({
        where: { seasonId: selectedSeason.id },
        orderBy: [{ nameHe: 'asc' }, { nameEn: 'asc' }],
      })
    : [];

  const selectedCompetitionId = searchParams?.competitionId || 'all';
  const selectedTeamId = searchParams?.teamId || 'all';

  const roundSourceGames = selectedSeason
    ? await prisma.game.findMany({
        where: {
          seasonId: selectedSeason.id,
          ...(selectedCompetitionId !== 'all' ? { competitionId: selectedCompetitionId } : {}),
          ...(selectedTeamId !== 'all'
            ? {
                OR: [{ homeTeamId: selectedTeamId }, { awayTeamId: selectedTeamId }],
              }
            : {}),
        },
        select: {
          roundNameHe: true,
          roundNameEn: true,
        },
        orderBy: { dateTime: 'desc' },
      })
    : [];

  const rounds = Array.from(
    new Set(
      roundSourceGames
        .map((game) => game.roundNameHe || game.roundNameEn)
        .filter((value): value is string => Boolean(value))
    )
  );

  const selectedRound = searchParams?.round || 'all';

  const gamesFilterFields = (() => {
    const competitionMap = new Map<string, { value: string; label: string; seasonMeta: Set<string> }>();
    const roundMap = new Map<
      string,
      { value: string; label: string; seasonMeta: Set<string>; competitionMeta: Set<string> }
    >();
    const teamMap = new Map<
      string,
      { value: string; label: string; seasonMeta: Set<string>; competitionMeta: Set<string>; roundMeta: Set<string> }
    >();

    for (const game of allFilterGames) {
      if (game.competitionId && game.competition) {
        const competitionEntry = competitionMap.get(game.competitionId);
        if (competitionEntry) {
          competitionEntry.seasonMeta.add(game.seasonId);
        } else {
          competitionMap.set(game.competitionId, {
            value: game.competitionId,
            label: getCompetitionDisplayName(game.competition),
            seasonMeta: new Set([game.seasonId]),
          });
        }
      }

      const roundValue = game.roundNameHe || game.roundNameEn;
      if (roundValue) {
        const roundKey = `${game.seasonId}__${roundValue}`;
        const roundEntry = roundMap.get(roundKey);
        if (roundEntry) {
          if (game.competitionId) roundEntry.competitionMeta.add(game.competitionId);
        } else {
          roundMap.set(roundKey, {
            value: roundValue,
            label: getRoundDisplayName(roundValue, roundValue),
            seasonMeta: new Set([game.seasonId]),
            competitionMeta: new Set(game.competitionId ? [game.competitionId] : []),
          });
        }
      }

      for (const teamId of [game.homeTeamId, game.awayTeamId]) {
        const team = allFilterTeams.find((entry) => entry.id === teamId);
        if (!team) continue;

        const teamEntry = teamMap.get(teamId);
        if (teamEntry) {
          teamEntry.seasonMeta.add(game.seasonId);
          if (game.competitionId) teamEntry.competitionMeta.add(game.competitionId);
          if (roundValue) teamEntry.roundMeta.add(roundValue);
        } else {
          teamMap.set(teamId, {
            value: teamId,
            label: team.nameHe || team.nameEn,
            seasonMeta: new Set([game.seasonId]),
            competitionMeta: new Set(game.competitionId ? [game.competitionId] : []),
            roundMeta: new Set(roundValue ? [roundValue] : []),
          });
        }
      }
    }

    const selectClassName = `rounded-2xl px-4 py-3 font-semibold ${
      displayMode === 'premier' ? 'border border-white/40 bg-white text-slate-950' : 'border border-stone-300 bg-stone-50'
    }`;

    return [
      {
        name: 'season',
        options: seasons.map((season) => ({ value: season.id, label: season.name })),
        className: selectClassName,
      },
      {
        name: 'competitionId',
        includeAllOption: true,
        allLabel: 'כל המסגרות',
        options: Array.from(competitionMap.values())
          .sort((a, b) => a.label.localeCompare(b.label, 'he'))
          .map((option) => ({
            value: option.value,
            label: option.label,
            meta: { season: Array.from(option.seasonMeta) },
          })),
        className: selectClassName,
      },
      {
        name: 'round',
        includeAllOption: true,
        allLabel: 'כל המחזורים',
        options: Array.from(roundMap.values())
          .sort((a, b) => a.label.localeCompare(b.label, 'he'))
          .map((option) => ({
            value: option.value,
            label: option.label,
            meta: {
              season: Array.from(option.seasonMeta),
              competitionId: Array.from(option.competitionMeta),
            },
          })),
        className: selectClassName,
      },
      {
        name: 'teamId',
        includeAllOption: true,
        allLabel: 'כל הקבוצות',
        options: Array.from(teamMap.values())
          .sort((a, b) => a.label.localeCompare(b.label, 'he'))
          .map((option) => ({
            value: option.value,
            label: option.label,
            meta: {
              season: Array.from(option.seasonMeta),
              competitionId: Array.from(option.competitionMeta),
              round: Array.from(option.roundMeta),
            },
          })),
        className: selectClassName,
      },
    ];
  })();

  // Each filter is its own OR-group; they must be ANDed together. Spreading two
  // `OR` keys into one object would silently drop the first (team+round combined
  // previously ignored the team filter).
  const gameFilters: Prisma.GameWhereInput[] = [];
  if (selectedTeamId !== 'all') {
    gameFilters.push({ OR: [{ homeTeamId: selectedTeamId }, { awayTeamId: selectedTeamId }] });
  }
  if (selectedRound !== 'all') {
    gameFilters.push({ OR: [{ roundNameHe: selectedRound }, { roundNameEn: selectedRound }] });
  }

  const games = selectedSeason
    ? await prisma.game.findMany({
        where: {
          seasonId: selectedSeason.id,
          ...(selectedCompetitionId !== 'all' ? { competitionId: selectedCompetitionId } : {}),
          ...(gameFilters.length ? { AND: gameFilters } : {}),
        },
        include: {
          homeTeam: true,
          awayTeam: true,
          competition: true,
          editorial: { select: { recapVideoUrl: true, fullMatchUrl: true } },
          _count: { select: { lineupEntries: true } },
          events: {
            include: {
              player: true,
              relatedPlayer: true,
            },
            orderBy: [{ minute: 'asc' }, { sortOrder: 'asc' }],
            take: 8,
          },
        },
        orderBy: [{ dateTime: layout === 'cards' ? 'asc' : 'desc' }],
      })
    : [];
  const layoutHref = (l: 'list' | 'cards') => {
    const q = new URLSearchParams();
    if (selectedSeason) q.set('season', selectedSeason.id);
    if (selectedCompetitionId !== 'all') q.set('competitionId', selectedCompetitionId);
    if (selectedRound !== 'all') q.set('round', selectedRound);
    if (selectedTeamId !== 'all') q.set('teamId', selectedTeamId);
    q.set('view', displayMode);
    if (l === 'cards') q.set('layout', 'cards');
    return `/games?${q.toString()}`;
  };

  return (
    <div dir="rtl" className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="modern-card rounded-2xl border border-stone-200/80 bg-white p-6 shadow-sm md:p-8">
          <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-[var(--accent)]">משחקים</p>
          <h1 className="mt-2 text-3xl font-black text-stone-900 md:text-4xl">מרכז המשחקים</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
            בחרו עונה, ליגה או גביע, מחזור וקבוצה כדי לראות את רשימת המשחקים.
          </p>

          <SmartFilterForm
            action="/games"
            hiddenFields={{ view: displayMode, ...(layout === 'cards' ? { layout } : {}) }}
            fields={gamesFilterFields}
            initialValues={{
              season: selectedSeason?.id || '',
              competitionId: selectedCompetitionId,
              round: selectedRound,
              teamId: selectedTeamId,
            }}
            formClassName="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1fr_auto]"
            buttonClassName="rounded-xl bg-[var(--accent)] px-5 py-2.5 font-bold text-white transition hover:opacity-90"
            submitLabel="סנן"
          />
        </section>

        <section className="modern-card overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-stone-100 px-6 py-5">
            <h2 className="border-r-[3px] border-[var(--accent)] pr-3 text-xl font-black text-stone-900">
              רשימת משחקים
            </h2>
            <div className="flex items-center gap-2">
              <div className="flex overflow-hidden rounded-full border border-stone-200 text-xs font-bold">
                {(['list', 'cards'] as const).map((l) => (
                  <Link key={l} href={layoutHref(l)} className={`px-3 py-1 ${layout === l ? 'bg-[var(--accent)] text-white' : 'bg-white text-stone-600 hover:bg-stone-50'}`}>
                    {l === 'list' ? 'רשימה' : 'כרטיסים'}
                  </Link>
                ))}
              </div>
              <span className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-xs font-bold text-stone-500">
                {games.length} משחקים
              </span>
            </div>
          </div>

          {layout === 'cards' ? (
            <SeasonGameCards games={games} />
          ) : (
          <div className="divide-y divide-stone-100">
            {games.map((game) => {
              const statusBadge = game.status === 'COMPLETED'
                ? { label: 'הסתיים', cls: 'bg-emerald-100 text-emerald-700' }
                : game.status === 'ONGOING'
                  ? { label: '● חי', cls: 'bg-red-100 text-red-600 animate-pulse' }
                  : game.status === 'CANCELLED'
                    ? { label: 'בוטל', cls: 'bg-stone-200 text-stone-500' }
                    : { label: 'מתוכנן', cls: 'bg-[var(--accent-glow)] text-[var(--accent-text)]' };

              return (
              <article key={game.id} className="transition hover:bg-stone-50/60">
                <div className="grid gap-4 px-5 py-4 md:grid-cols-[1fr_auto_1fr] md:items-center">
                  <div className="flex items-center gap-3 md:justify-start justify-center">
                    {game.homeTeam.logoUrl ? (
                      <img src={game.homeTeam.logoUrl} alt="" className="h-9 w-9 object-contain" />
                    ) : (
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-100 text-[10px] font-black text-stone-400">
                        {(game.homeTeam.nameHe || game.homeTeam.nameEn || '?').slice(0, 2)}
                      </div>
                    )}
                    <div>
                      <div className="font-black text-stone-900">{game.homeTeam.nameHe || game.homeTeam.nameEn}</div>
                    </div>
                  </div>

                  <div className="flex flex-col items-center gap-1.5 text-center">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${statusBadge.cls}`}>{statusBadge.label}</span>
                    <div className="min-w-[90px] rounded-xl bg-stone-900 px-4 py-2 text-lg font-black text-white">
                      {getGameScoreDisplay(game)}
                    </div>
                    <div className="text-[11px] font-semibold text-stone-500">
                      {getCompetitionDisplayName(game.competition)} · {getRoundDisplayName(game.roundNameHe, game.roundNameEn)}
                    </div>
                    <div className="text-[11px] text-stone-400">
                      {gameDateLabel({ ...game, seasonYear: selectedSeason?.year, roundNameHe: null, roundNameEn: null }, (d) => new Intl.DateTimeFormat('he-IL', { dateStyle: 'short', timeStyle: 'short' }).format(d))}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 md:justify-end justify-center">
                    <div className="text-left">
                      <div className="font-black text-stone-900">{game.awayTeam.nameHe || game.awayTeam.nameEn}</div>
                    </div>
                    {game.awayTeam.logoUrl ? (
                      <img src={game.awayTeam.logoUrl} alt="" className="h-9 w-9 object-contain" />
                    ) : (
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-100 text-[10px] font-black text-stone-400">
                        {(game.awayTeam.nameHe || game.awayTeam.nameEn || '?').slice(0, 2)}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 border-t border-stone-100 bg-stone-50/50 px-5 py-3">
                  <Link href={`/games/${game.id}?view=${displayMode}`} className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-bold text-white transition hover:opacity-90">
                    לעמוד המשחק
                  </Link>
                  {currentUser?.role === 'ADMIN' ? (
                    <Link
                      href={`/games/${game.id}?view=${displayMode}#admin-editor`}
                      className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-900"
                    >
                      עריכה
                    </Link>
                  ) : null}
                  <details className="group">
                    <summary className="cursor-pointer list-none rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-bold text-stone-600 transition hover:border-[var(--accent)]/30 hover:text-[var(--accent)]">
                      אירועים ▾
                    </summary>
                    <div className="mt-3 grid gap-2 md:min-w-[460px]">
                      {game.events.length > 0 ? (
                        game.events.map((event) => (
                          <div key={event.id} className="rounded-xl border border-stone-100 bg-white p-3 text-sm">
                            <div className="flex items-center justify-between gap-3">
                              <span className="font-bold text-stone-900">{eventLabels[event.type] || event.type}</span>
                              <span className="text-xs font-semibold text-stone-500">
                                {event.minute}{event.extraMinute ? `+${event.extraMinute}` : ''}&apos;
                              </span>
                            </div>
                            <div className="mt-1 text-xs text-stone-500">
                              {event.player ? formatPlayerName(event.player) : 'שחקן לא משויך'}
                              {event.relatedPlayer ? ` · ${formatPlayerName(event.relatedPlayer)}` : ''}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-xl border border-dashed border-stone-200 p-4 text-center text-xs text-stone-400">
                          אין אירועים שמורים
                        </div>
                      )}
                    </div>
                  </details>
                </div>
              </article>
              );
            })}

            {games.length === 0 ? (
              <div className="p-12 text-center text-sm text-stone-400">
                לא נמצאו משחקים לפי הסינון שבחרת.
              </div>
            ) : null}
          </div>
          )}
        </section>

        {/* Source credit — the 1950-2020 games come from Eyal Hatav's book (owner asked for this note). */}
        <footer className="mt-6 rounded-2xl border border-stone-200 bg-white/70 px-5 py-4 text-center text-xs leading-6 text-stone-500">
          נתוני משחקי הפועל באר שבע בשנים 1950–2020 מבוססים על הספר{' '}
          <span className="font-bold text-stone-700">״הפועל באר-שבע – כל המשחקים 1950–2020״</span> מאת אייל חטב.
          <br />
          תודה גדולה לאייל על שנים של תיעוד מסור, שבזכותו ההיסטוריה של המועדון נשמרת.
        </footer>
      </div>
    </div>
  );
}

type CardGame = {
  id: string;
  dateTime: Date;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  roundNameHe: string | null;
  roundNameEn: string | null;
  homeTeam: { nameHe: string; nameEn: string; apiFootballId: number | null };
  awayTeam: { nameHe: string; nameEn: string; apiFootballId: number | null };
  competition: { nameHe: string | null; nameEn: string } | null;
  editorial: { recapVideoUrl: string | null; fullMatchUrl: string | null } | null;
  _count: { lineupEntries: number };
};

const isBeerSheva = (t: CardGame['homeTeam']) => t.apiFootballId === 563 || (/^הפועל/.test(t.nameHe) && /באר[ -]שבע/.test(t.nameHe));

// The season at a glance: one card per game in date order — date and round, both teams with
// the score (winner in bold), icons for a video / lineups, and Beer Sheva's result as a stripe.
function SeasonGameCards({ games }: { games: CardGame[] }) {
  if (!games.length) return <div className="p-12 text-center text-sm text-stone-400">לא נמצאו משחקים לפי הסינון שבחרת.</div>;
  const date = new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jerusalem' });
  return (
    <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {games.map((g) => {
        const played = g.homeScore != null && g.awayScore != null;
        const homeWon = played && g.homeScore! > g.awayScore!;
        const awayWon = played && g.awayScore! > g.homeScore!;
        const hbsHome = isBeerSheva(g.homeTeam);
        const hbsAway = isBeerSheva(g.awayTeam);
        const stripe = !played || (!hbsHome && !hbsAway)
          ? 'border-b-stone-200'
          : (hbsHome ? homeWon : awayWon) ? 'border-b-emerald-500' : homeWon || awayWon ? 'border-b-red-500' : 'border-b-amber-400';
        const video = g.editorial?.recapVideoUrl || g.editorial?.fullMatchUrl;
        const round = getRoundDisplayName(g.roundNameHe, g.roundNameEn);
        const row = (team: CardGame['homeTeam'], score: number | null, won: boolean) => (
          <div className="flex items-center justify-between gap-2 px-3 py-1.5">
            <span className={`truncate ${won ? 'font-black text-stone-900' : 'text-stone-700'}`}>{team.nameHe || team.nameEn}</span>
            <span className={`tabular-nums ${won ? 'font-black text-stone-900' : 'text-stone-600'}`}>{score ?? '–'}</span>
          </div>
        );
        return (
          <Link key={g.id} href={`/games/${g.id}`} className={`overflow-hidden rounded-xl border border-stone-200 border-b-4 ${stripe} bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md`}>
            <div className="flex items-center justify-between gap-2 bg-[var(--accent)] px-3 py-1.5 text-xs font-bold text-white">
              <span>{date.format(g.dateTime)}</span>
              <span className="flex gap-1.5" aria-label="מה יש במשחק">
                {video ? <span title="יש וידאו">🎬</span> : null}
                {g._count.lineupEntries ? <span title="יש הרכבים">📋</span> : null}
              </span>
            </div>
            <div className="border-b border-stone-100 px-3 py-1 text-center text-xs text-stone-500">
              {[round, g.competition ? getCompetitionDisplayName(g.competition) : null].filter(Boolean).join(' · ')}
            </div>
            <div className="py-1 text-sm">
              {row(g.homeTeam, g.homeScore, homeWon)}
              {row(g.awayTeam, g.awayScore, awayWon)}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
