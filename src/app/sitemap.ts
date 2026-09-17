import type { MetadataRoute } from 'next';
import prisma from '@/lib/prisma';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://statsai.co.il';

// Public, indexable top-level routes. Detail pages (teams/players/games) are
// reachable via internal links and intentionally not enumerated here.
const PUBLIC_PATHS = [
  '',
  '/standings',
  '/games',
  '/players',
  '/coaches',
  '/statistics',
  '/statistics/all-time',
  '/statistics/best-xi',
  '/statistics/insights',
  '/statistics/advanced',
  '/referees',
  '/predictions',
  '/compare',
  '/venues',
  '/live',
  '/privacy',
  '/support',
  '/club',
  '/club/seasons',
  '/club/calendar',
  '/club/archive',
  '/club/matchday',
  '/club/eras',
  '/club/quiz',
  '/songs',
  '/history',
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const dossiers = await prisma.clubSeasonDossier.findMany({
    where: {
      isPublished: true,
      team: { apiFootballId: 563 },
    },
    select: { seasonId: true, updatedAt: true },
    orderBy: [{ seasonId: 'asc' }],
  });
  return [...PUBLIC_PATHS.map((path) => ({
    url: `${BASE_URL}${path}`,
    changeFrequency: path === '' || path === '/live' ? 'daily' : 'weekly',
    priority: path === '' ? 1 : 0.7,
  } satisfies MetadataRoute.Sitemap[number])), ...dossiers.map((dossier) => ({
    url: `${BASE_URL}/club/seasons/${dossier.seasonId}`,
    lastModified: dossier.updatedAt,
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }))];
}
