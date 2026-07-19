import { getCurrentUser } from '@/lib/auth';
import { getCurrentSeasonStartYear } from '@/lib/home-live';
import { normalizeHomeLeagueScope } from '@/lib/home-league-scope';
import prisma from '@/lib/prisma';
import {
  DEFAULT_TELEGRAM_SOURCES,
  fetchTelegramMessagesFromSources,
  normalizeTelegramSource,
} from '@/lib/telegram';

function getTeamLabel(team: { nameHe: string | null; nameEn: string }) {
  return team.nameHe || team.nameEn;
}

function truncateText(text: string, maxLength: number) {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}...`;
}

function mapTelegramMessage(message: {
  id: string;
  sourceLabel: string;
  teamLabel: string;
  url: string;
  imageUrl?: string | null;
  publishedAt: Date | null;
  text: string;
}) {
  return {
    id: message.id,
    source: message.sourceLabel,
    teamLabel: message.teamLabel,
    url: message.url,
    imageUrl: message.imageUrl || null,
    publishedAt: message.publishedAt ? message.publishedAt.toISOString() : null,
    title: truncateText(message.text.replace(/\s+/g, ' ').trim(), 80),
    previewText: truncateText(message.text, 160),
    fullText: message.text,
  };
}

async function getConfiguredTelegramSources() {
  const telegramSourcesSetting = await prisma.siteSetting.findUnique({
    where: { key: 'telegram_sources' },
  });

  const configuredTelegramSourcesRaw = Array.isArray(telegramSourcesSetting?.valueJson)
    ? (telegramSourcesSetting.valueJson as Array<Record<string, unknown>>)
    : [];

  const telegramSources =
    configuredTelegramSourcesRaw
      .map((source) =>
        normalizeTelegramSource({
          slug: typeof source.slug === 'string' ? source.slug : null,
          url: typeof source.url === 'string' ? source.url : null,
          label: typeof source.label === 'string' ? source.label : '',
          teamLabel: typeof source.teamLabel === 'string' ? source.teamLabel : '',
        })
      )
      .filter((source): source is NonNullable<typeof source> => Boolean(source)) || [];

  return telegramSources.length ? telegramSources : DEFAULT_TELEGRAM_SOURCES;
}

function normalizeIdArray(value: unknown) {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .map((item) => Number(item))
        .filter((item) => Number.isInteger(item) && item !== 0)
    )
  );
}

export async function getMobileNewsPayload(limit = 10) {
  const sources = await getConfiguredTelegramSources();
  const safeLimit = Math.max(1, Math.min(limit, 20));
  const messages = await fetchTelegramMessagesFromSources(sources, safeLimit).catch(() => []);

  return {
    updatedAt: new Date().toISOString(),
    sources: sources.map((source) => ({
      slug: source.slug,
      label: source.label,
      teamLabel: source.teamLabel,
    })),
    items: messages.slice(0, safeLimit).map(mapTelegramMessage),
  };
}

export async function getMobilePreferencesPayload(params?: { userId?: string }) {
  let viewer: { id: string } | null = null;
  if (params?.userId !== undefined) {
    viewer = params.userId ? { id: params.userId } : null;
  } else {
    viewer = await getCurrentUser();
  }
  if (!viewer) return null;

  const user = await prisma.user.findUnique({
    where: { id: viewer.id },
    select: {
      favoriteTeamApiIds: true,
      favoriteCompetitionApiIds: true,
      homeLeagueScope: true,
      notifyGoals: true,
      notifyResults: true,
      notifyReminders: true,
      notifyNews: true,
      notifyOnThisDay: true,
    },
  });

  const [latestSeason, competitions] = await Promise.all([
    prisma.season.findFirst({
      where: { year: { lte: getCurrentSeasonStartYear() } },
      orderBy: { year: 'desc' },
    }),
    prisma.competition.findMany({
      orderBy: [{ countryHe: 'asc' }, { nameHe: 'asc' }, { nameEn: 'asc' }],
      select: {
        id: true,
        apiFootballId: true,
        nameHe: true,
        nameEn: true,
        countryHe: true,
        countryEn: true,
      },
    }),
  ]);

  const teams = latestSeason
    ? await prisma.team.findMany({
        where: { seasonId: latestSeason.id, apiFootballId: { not: null } },
        orderBy: [{ nameHe: 'asc' }, { nameEn: 'asc' }],
        select: {
          id: true,
          apiFootballId: true,
          nameHe: true,
          nameEn: true,
          logoUrl: true,
        },
      })
    : [];

  return {
    favoriteTeamApiIds: user?.favoriteTeamApiIds || [],
    favoriteCompetitionApiIds: user?.favoriteCompetitionApiIds || [],
    homeLeagueScope: normalizeHomeLeagueScope(user?.homeLeagueScope) ?? 'FAVORITES',
    notifications: {
      goals: user?.notifyGoals ?? true,
      results: user?.notifyResults ?? true,
      reminders: user?.notifyReminders ?? true,
      news: user?.notifyNews ?? true,
      onThisDay: user?.notifyOnThisDay ?? true,
    },
    availableTeams: teams.map((team) => ({
      id: team.id,
      apiFootballId: team.apiFootballId,
      name: getTeamLabel(team),
      logoUrl: team.logoUrl,
    })),
    availableCompetitions: competitions
      .filter((competition) => competition.apiFootballId !== null)
      .map((competition) => ({
        id: competition.id,
        apiFootballId: competition.apiFootballId,
        name: competition.nameHe || competition.nameEn,
        country: competition.countryHe || competition.countryEn || null,
      })),
  };
}

export async function updateMobilePreferencesPayload(input: {
  userId: string;
  favoriteTeamApiIds?: unknown;
  favoriteCompetitionApiIds?: unknown;
  homeLeagueScope?: unknown;
  notifications?: unknown;
}) {
  const data: Record<string, unknown> = {};
  if (input.favoriteTeamApiIds !== undefined) data.favoriteTeamApiIds = normalizeIdArray(input.favoriteTeamApiIds);
  if (input.favoriteCompetitionApiIds !== undefined) data.favoriteCompetitionApiIds = normalizeIdArray(input.favoriteCompetitionApiIds);
  if (input.homeLeagueScope !== undefined) {
    const scope = normalizeHomeLeagueScope(input.homeLeagueScope);
    if (scope) data.homeLeagueScope = scope;
  }

  // Per-category notification toggles — only the booleans actually sent.
  const notif = input.notifications;
  if (notif && typeof notif === 'object') {
    const map: Record<string, string> = {
      goals: 'notifyGoals',
      results: 'notifyResults',
      reminders: 'notifyReminders',
      news: 'notifyNews',
      onThisDay: 'notifyOnThisDay',
    };
    for (const [key, column] of Object.entries(map)) {
      const v = (notif as Record<string, unknown>)[key];
      if (typeof v === 'boolean') data[column] = v;
    }
  }

  const user = await prisma.user.update({
    where: { id: input.userId },
    data,
    select: {
      favoriteTeamApiIds: true,
      favoriteCompetitionApiIds: true,
      homeLeagueScope: true,
      notifyGoals: true,
      notifyResults: true,
      notifyReminders: true,
      notifyNews: true,
      notifyOnThisDay: true,
    },
  });

  return {
    ok: true,
    favoriteTeamApiIds: user.favoriteTeamApiIds,
    favoriteCompetitionApiIds: user.favoriteCompetitionApiIds,
    homeLeagueScope: normalizeHomeLeagueScope(user.homeLeagueScope) ?? 'FAVORITES',
    notifications: {
      goals: user.notifyGoals,
      results: user.notifyResults,
      reminders: user.notifyReminders,
      news: user.notifyNews,
      onThisDay: user.notifyOnThisDay,
    },
  };
}
