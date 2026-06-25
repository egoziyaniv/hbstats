import Link from 'next/link';
import { sweepStaleJobs } from '@/lib/job-sweeper';
import AdminCollapsible from '@/components/AdminCollapsible';
import AdminLiveCountriesClient from '@/components/AdminLiveCountriesClient';
import AdminHomepageLiveSettingsClient from '@/components/AdminHomepageLiveSettingsClient';
import AdminPlayerDisplaySettingsClient from '@/components/AdminPlayerDisplaySettingsClient';
import AdminTelegramSourcesClient from '@/components/AdminTelegramSourcesClient';
import AdminPushSettingsClient from '@/components/AdminPushSettingsClient';
import AdminAiSettingsClient from '@/components/AdminAiSettingsClient';
import AdminManagerClient from '@/components/AdminManagerClient';
import { buildAdminCoverageRows } from '@/lib/admin-data-coverage';
import { getCurrentUser } from '@/lib/auth';
import { getHomepageLiveLimitSetting } from '@/lib/homepage-live-settings';
import { getPushCategoryFlags } from '@/lib/push-settings';
import { getAllowedLiveCountryLabels } from '@/lib/live-competition-settings';
import { getDisplayZeroStatPlayersSetting } from '@/lib/player-zero-stat-settings';
import prisma from '@/lib/prisma';
import { DEFAULT_TELEGRAM_SOURCES, normalizeTelegramSource } from '@/lib/telegram';

export const dynamic = 'force-dynamic';

export default async function AdminPage({
  searchParams,
}: {
  searchParams?: { season?: string };
}) {
  const user = await getCurrentUser();

  if (!user || user.role !== 'ADMIN') {
    return (
      <div className="min-h-screen bg-[linear-gradient(180deg,#f8f3eb_0%,#efe4d0_100%)] px-4 py-16">
        <div className="mx-auto max-w-2xl rounded-[28px] border border-stone-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-3xl font-black text-stone-900">גישה לאזור אדמין</h1>
          <p className="mt-4 text-sm leading-7 text-stone-600">
            כדי להיכנס לאדמין צריך להיות מחובר עם משתמש בעל הרשאת מנהל.
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <Link href="/login" className="rounded-full bg-stone-900 px-5 py-3 text-sm font-bold text-white">
              להתחברות
            </Link>
            <Link href="/" className="rounded-full border border-stone-300 px-5 py-3 text-sm font-bold text-stone-700">
              חזרה לדף הבית
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Mark jobs left RUNNING by a crash/restart as FAILED before listing them.
  await sweepStaleJobs();

  const seasons = await prisma.season.findMany({ orderBy: { year: 'desc' } });
  const selectedSeasonId = searchParams?.season || seasons[0]?.id || null;

  const [teams, fetchJobs, telegramSourcesSetting, displayZeroStatPlayers, homepageLiveLimit, liveCountryLabels, liveSnapshots, coverageSeason, pushFlags] = await Promise.all([
    prisma.team.findMany({
      include: { season: true },
      orderBy: [{ updatedAt: 'desc' }],
    }),
    prisma.fetchJob.findMany({
      orderBy: { createdAt: 'desc' },
      take: 8,
    }),
    prisma.siteSetting.findUnique({
      where: { key: 'telegram_sources' },
    }),
    getDisplayZeroStatPlayersSetting(),
    getHomepageLiveLimitSetting(),
    getAllowedLiveCountryLabels(),
    prisma.liveGameSnapshot.findMany({
      where: {
        feedScope: 'GLOBAL_HOMEPAGE',
      },
      select: {
        rawJson: true,
      },
      orderBy: [{ snapshotAt: 'desc' }],
      take: 50,
    }),
    selectedSeasonId ? prisma.season.findUnique({
      where: { id: selectedSeasonId },
      include: {
        competitions: {
          include: {
            competition: {
              select: {
                id: true,
                apiFootballId: true,
                nameHe: true,
                nameEn: true,
                countryHe: true,
                countryEn: true,
                type: true,
              },
            },
          },
        },
        teams: {
          select: {
            id: true,
            apiFootballId: true,
            nameHe: true,
            nameEn: true,
            venueId: true,
            _count: {
              select: {
                players: true,
              },
            },
          },
        },
        games: {
          select: {
            id: true,
            competitionId: true,
            homeTeamId: true,
            awayTeamId: true,
            venueId: true,
            status: true,
            dateTime: true,
            updatedAt: true,
            _count: {
              select: {
                events: true,
                lineupEntries: true,
              },
            },
          },
        },
        standings: {
          select: {
            id: true,
            competitionId: true,
            teamId: true,
            updatedAt: true,
          },
        },
        playerStats: {
          select: {
            id: true,
            competitionId: true,
            updatedAt: true,
            player: {
              select: {
                id: true,
                teamId: true,
              },
            },
          },
        },
        teamStats: {
          select: {
            id: true,
            competitionId: true,
            teamId: true,
            updatedAt: true,
          },
        },
        leaderboardEntries: {
          select: {
            id: true,
            competitionId: true,
            teamId: true,
            updatedAt: true,
          },
        },
        predictions: {
          select: {
            id: true,
            competitionId: true,
            updatedAt: true,
            game: {
              select: {
                homeTeamId: true,
                awayTeamId: true,
                status: true,
                dateTime: true,
              },
            },
          },
        },
        headToHeadEntries: {
          select: {
            id: true,
            competitionId: true,
            updatedAt: true,
            game: {
              select: {
                homeTeamId: true,
                awayTeamId: true,
                status: true,
                dateTime: true,
              },
            },
          },
        },
        oddsValues: {
          select: {
            id: true,
            competitionId: true,
            updatedAt: true,
            oddsUpdatedAt: true,
            game: {
              select: {
                homeTeamId: true,
                awayTeamId: true,
                status: true,
                dateTime: true,
              },
            },
          },
        },
        liveSnapshots: {
          select: {
            id: true,
            competitionId: true,
            snapshotAt: true,
            feedScope: true,
            gameId: true,
            homeTeamApiFootballId: true,
            awayTeamApiFootballId: true,
          },
        },
        fetchJobs: {
          where: {
            status: 'COMPLETED',
          },
          select: {
            id: true,
            competitionId: true,
            teamId: true,
            createdAt: true,
            finishedAt: true,
            stepsJson: true,
          },
          orderBy: [{ finishedAt: 'desc' }, { createdAt: 'desc' }],
        },
      },
    }) : Promise.resolve(null),
    getPushCategoryFlags(),
  ]);

  const telegramSourcesRaw = Array.isArray(telegramSourcesSetting?.valueJson)
    ? (telegramSourcesSetting.valueJson as Array<Record<string, unknown>>)
    : [];
  const telegramSources =
    telegramSourcesRaw
      .map((source) =>
        normalizeTelegramSource({
          slug: typeof source.slug === 'string' ? source.slug : null,
          url: typeof source.url === 'string' ? source.url : null,
          label: typeof source.label === 'string' ? source.label : '',
          teamLabel: typeof source.teamLabel === 'string' ? source.teamLabel : '',
        })
      )
      .filter((source): source is NonNullable<typeof source> => Boolean(source)) || [];

  const selectedSeason = seasons.find((season) => season.id === selectedSeasonId) || seasons[0] || null;
  const coverageRows = buildAdminCoverageRows(coverageSeason ? [coverageSeason] : []);
  const liveCountries = Array.from(
    new Set(
      liveSnapshots
        .map((snapshot) => {
          const country = snapshot.rawJson && typeof snapshot.rawJson === 'object' ? (snapshot.rawJson as any)?.league?.country : null;
          return typeof country === 'string' && country.trim() ? country.trim() : null;
        })
        .filter((country): country is string => Boolean(country))
    )
  ).sort((a, b) => a.localeCompare(b, 'he'));

  const rawData = selectedSeason
    ? await prisma.season.findUnique({
        where: { id: selectedSeason.id },
        include: {
          teams: {
            include: {
              coachAssignments: {
                orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
              },
              players: {
                orderBy: [{ nameHe: 'asc' }, { nameEn: 'asc' }],
              },
              standings: {
                include: {
                  competition: true,
                },
                orderBy: [{ position: 'asc' }],
              },
            },
            orderBy: [{ nameHe: 'asc' }, { nameEn: 'asc' }],
          },
          games: {
            take: 60,
            include: {
              homeTeam: true,
              awayTeam: true,
              competition: true,
              lineupEntries: {
                include: {
                  team: true,
                  player: true,
                },
                orderBy: [{ role: 'asc' }, { teamId: 'asc' }],
              },
              events: {
                include: {
                  player: true,
                  relatedPlayer: true,
                  eventTeam: true,
                },
                orderBy: [{ minute: 'asc' }, { sortOrder: 'asc' }],
              },
              gameStats: true,
            },
            orderBy: [{ dateTime: 'desc' }],
          },
          standings: {
            include: {
              team: true,
              competition: true,
            },
            orderBy: [{ position: 'asc' }, { points: 'desc' }],
          },
          fetchJobs: {
            include: {
              competition: true,
              team: true,
            },
            orderBy: [{ createdAt: 'desc' }],
          },
          playerStats: {
            take: 100,
            include: {
              player: {
                include: {
                  team: true,
                },
              },
              competition: true,
            },
            orderBy: [{ goals: 'desc' }, { assists: 'desc' }],
          },
          teamStats: {
            take: 50,
            include: {
              team: true,
              competition: true,
            },
            orderBy: [{ points: 'desc' }],
          },
          competitions: {
            include: {
              competition: true,
            },
            orderBy: [{ createdAt: 'desc' }],
          },
          leaderboardEntries: {
            take: 100,
            include: {
              player: true,
              team: true,
              competition: true,
            },
            orderBy: [{ category: 'asc' }, { rank: 'asc' }],
          },
          injuries: {
            take: 50,
            include: {
              player: true,
              team: true,
              competition: true,
              game: {
                include: {
                  homeTeam: true,
                  awayTeam: true,
                },
              },
            },
            orderBy: [{ fixtureDate: 'desc' }, { createdAt: 'desc' }],
          },
          transfers: {
            take: 50,
            include: {
              player: true,
            },
            orderBy: [{ transferDate: 'desc' }, { createdAt: 'desc' }],
          },
          trophies: {
            take: 50,
            include: {
              player: true,
            },
            orderBy: [{ playerNameHe: 'asc' }, { leagueNameEn: 'asc' }],
          },
          predictions: {
            take: 50,
            include: {
              game: {
                include: {
                  homeTeam: true,
                  awayTeam: true,
                },
              },
            },
            orderBy: [{ createdAt: 'desc' }],
          },
          headToHeadEntries: {
            take: 50,
            include: {
              game: {
                include: {
                  homeTeam: true,
                  awayTeam: true,
                },
              },
            },
            orderBy: [{ relatedDate: 'desc' }],
          },
          oddsValues: {
            take: 50,
            include: {
              game: {
                include: {
                  homeTeam: true,
                  awayTeam: true,
                },
              },
            },
            orderBy: [{ oddsUpdatedAt: 'desc' }, { bookmakerName: 'asc' }],
          },
          liveSnapshots: {
            take: 30,
            where: {
              feedScope: 'LOCAL',
            },
            orderBy: [{ snapshotAt: 'desc' }],
          },
        },
      })
    : null;

  const groupedTeams = Array.from(
    teams.reduce((map, team) => {
      const key = team.apiFootballId ? `api-${team.apiFootballId}` : `name-${encodeURIComponent(team.nameEn)}`;
      const existing = map.get(key);

      if (!existing) {
        map.set(key, {
          key,
          displayNameHe: team.nameHe,
          displayNameEn: team.nameEn,
          logoUrl: team.logoUrl,
          seasons: [team.season.name],
          latestSeasonYear: team.season.year,
        });
        return map;
      }

      existing.seasons.push(team.season.name);
      if (team.season.year > existing.latestSeasonYear) {
        existing.latestSeasonYear = team.season.year;
        existing.displayNameHe = team.nameHe;
        existing.displayNameEn = team.nameEn;
        existing.logoUrl = team.logoUrl;
      }

      return map;
    }, new Map<string, {
      key: string;
      displayNameHe: string | null;
      displayNameEn: string;
      logoUrl: string | null;
      seasons: string[];
      latestSeasonYear: number;
    }>())
  )
    .map(([, value]) => ({
      ...value,
      seasons: Array.from(new Set(value.seasons)).sort().reverse(),
    }))
    .sort((a, b) => a.displayNameEn.localeCompare(b.displayNameEn));

  const adminTab = (searchParams as any)?.adminTab || 'data';

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8f3eb_0%,#efe4d0_100%)] px-4 py-8">
      <div className="mx-auto max-w-6xl space-y-5">
        {/* Header */}
        <section className="rounded-[24px] border border-white/10 bg-[linear-gradient(135deg,#7f1d1d,#1f2937)] px-6 py-5 text-white shadow-md">
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-2xl font-black">אזור אדמין</h1>
            <Link
              href="/admin/matchday"
              className="rounded-full bg-emerald-500 px-4 py-2 text-xs font-black text-white shadow-sm transition hover:bg-emerald-600"
            >
              עדכון יום משחקים →
            </Link>
          </div>
        </section>

        {/* Grouped navigation — 3 clusters */}
        <section className="grid gap-3 md:grid-cols-3">
          {/* ניהול תוכן */}
          <div className="rounded-[20px] border border-stone-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-black text-stone-900">ניהול תוכן</h2>
            <div className="flex flex-col gap-2 text-sm font-bold">
              <Link href={`/admin/quick-edit?season=${selectedSeason?.id || ''}`} className="rounded-lg bg-stone-50 px-3 py-2 text-stone-800 transition hover:bg-stone-100">⚡ עריכה מהירה</Link>
              <Link href={`/admin/games?season=${selectedSeason?.id || ''}`} className="rounded-lg bg-stone-50 px-3 py-2 text-stone-800 transition hover:bg-stone-100">⚽ משחקים</Link>
              <Link href="/admin/venues" className="rounded-lg bg-stone-50 px-3 py-2 text-stone-800 transition hover:bg-stone-100">🏟️ אצטדיונים</Link>
              <Link href="/admin/referees" className="rounded-lg bg-stone-50 px-3 py-2 text-stone-800 transition hover:bg-stone-100">🟨 שופטים</Link>
              <Link href="/admin/coaches" className="rounded-lg bg-stone-50 px-3 py-2 text-stone-800 transition hover:bg-stone-100">📋 מאמנים</Link>
            </div>
          </div>

          {/* שחקנים וציונים */}
          <div className="rounded-[20px] border border-stone-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-black text-stone-900">שחקנים וציונים</h2>
            <div className="flex flex-col gap-2 text-sm font-bold">
              <Link href="/admin/ratings" className="rounded-lg bg-stone-50 px-3 py-2 text-stone-800 transition hover:bg-stone-100">⭐ ציוני שחקנים</Link>
              <Link href="/admin/unlinked" className="rounded-lg bg-stone-50 px-3 py-2 text-stone-800 transition hover:bg-stone-100">🔗 קישור ידני</Link>
              <Link href="/admin/scrape" className="rounded-lg bg-blue-50 px-3 py-2 text-blue-900 transition hover:bg-blue-100">🌐 סריקת אתרים</Link>
              <Link href="/admin/flashscore" className="rounded-lg bg-blue-50 px-3 py-2 text-blue-900 transition hover:bg-blue-100">📊 Flashscore</Link>
              <Link href="/admin/sofascore" className="rounded-lg bg-blue-50 px-3 py-2 text-blue-900 transition hover:bg-blue-100">⭐ Sofascore</Link>
              <Link href="/admin/merge" className="rounded-lg bg-purple-50 px-3 py-2 text-purple-900 transition hover:bg-purple-100">🔀 מיזוג נתונים</Link>
            </div>
          </div>

          {/* תפעול ונתונים */}
          <div className="rounded-[20px] border border-stone-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-black text-stone-900">תפעול ונתונים</h2>
            <div className="flex flex-col gap-2 text-sm font-bold">
              <Link href="/admin/matchday" className="rounded-lg bg-emerald-50 px-3 py-2 text-emerald-900 transition hover:bg-emerald-100">📅 יום משחקים</Link>
              <Link href="/admin/setup" className="rounded-lg bg-emerald-50 px-3 py-2 text-emerald-900 transition hover:bg-emerald-100">📥 ייבוא מלא</Link>
              <Link href="/admin/db-transfer" className="rounded-lg bg-orange-50 px-3 py-2 text-orange-900 transition hover:bg-orange-100">💾 העברת DB</Link>
            </div>
          </div>
        </section>

        {/* Tab navigation */}
        <nav className="flex flex-wrap gap-2">
          {[
            { key: 'data', label: 'נתונים ומשיכה' },
            { key: 'settings', label: 'הגדרות' },
          ].map((tab) => (
            <Link
              key={tab.key}
              href={`/admin?season=${selectedSeason?.id || ''}&adminTab=${tab.key}`}
              className={`rounded-full px-5 py-2.5 text-sm font-bold transition ${
                adminTab === tab.key
                  ? 'bg-stone-900 text-white shadow-sm'
                  : 'bg-white text-stone-600 hover:bg-stone-100'
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </nav>

        {/* Settings tab */}
        {adminTab === 'settings' ? (
          <div className="space-y-4">
            <AdminLiveCountriesClient options={liveCountries} initialSelectedCountries={liveCountryLabels || liveCountries} />
            <AdminHomepageLiveSettingsClient initialHomepageLiveLimit={homepageLiveLimit} />
            <AdminPlayerDisplaySettingsClient initialDisplayZeroStatPlayers={displayZeroStatPlayers} />
            <AdminTelegramSourcesClient initialSources={telegramSources.length ? telegramSources : DEFAULT_TELEGRAM_SOURCES} />
            <AdminPushSettingsClient initialFlags={pushFlags} />
            <AdminAiSettingsClient />
          </div>
        ) : null}

        {/* Data tab (default) */}
        {adminTab === 'data' ? (
          <div className="space-y-4">
            <section className="rounded-[20px] border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-black text-emerald-900">עדכון יום משחקים</h2>
                  <p className="mt-1 text-xs text-emerald-700/80">
                    סנכרון מהיר של נתוני יום ספציפי: API-Football (אירועים, הרכבים, סטטיסטיקה) + מיזוג.
                  </p>
                </div>
                <Link
                  href="/admin/matchday"
                  className="rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-black text-white shadow-sm transition hover:bg-emerald-700"
                >
                  פתח עדכון יום משחקים →
                </Link>
              </div>
            </section>

            <AdminManagerClient
              teams={groupedTeams}
              fetchTeams={teams}
              fetchJobs={fetchJobs}
              seasons={seasons}
              selectedSeasonId={selectedSeason?.id || null}
              rawData={rawData}
              coverageRows={coverageRows}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
