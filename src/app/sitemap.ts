import type { MetadataRoute } from 'next';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://hbs.co.il';

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
];

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PATHS.map((path) => ({
    url: `${BASE_URL}${path}`,
    changeFrequency: path === '' || path === '/live' ? 'daily' : 'weekly',
    priority: path === '' ? 1 : 0.7,
  }));
}
