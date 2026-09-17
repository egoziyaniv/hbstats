import { createHash } from 'node:crypto';
import prisma from '@/lib/prisma';
import { buildClubCalendar } from '@/lib/club-calendar';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Public, read-only subscription: identity spans all seasonal Team records. */
export async function GET(request: Request): Promise<Response> {
  try {
    const now = new Date();
    const seasons = await prisma.season.findMany({
      where: { startDate: { lte: now } }, orderBy: { year: 'desc' }, take: 2, select: { id: true },
    });
    const games = await prisma.game.findMany({
      where: {
        AND: [
          { OR: [{ homeTeam: { apiFootballId: 563 } }, { awayTeam: { apiFootballId: 563 } }] },
          { OR: [{ seasonId: { in: seasons.map((season) => season.id) } }, { dateTime: { gte: now } }] },
          { competition: {
            type: { in: ['LEAGUE', 'CUP', 'EUROPE'] },
            AND: [
              { OR: [{ apiFootballId: null }, { apiFootballId: { not: 667 } }] },
              { NOT: { nameEn: { contains: 'friendly', mode: 'insensitive' } } },
              { NOT: { nameEn: { contains: 'friendlies', mode: 'insensitive' } } },
              { NOT: { nameHe: { contains: 'ידידות' } } },
            ],
          } },
        ],
      },
      select: {
        id: true, dateTime: true, updatedAt: true, status: true, statusShort: true, statusLong: true,
        venueNameHe: true, venueNameEn: true,
        homeTeam: { select: { nameHe: true, nameEn: true } },
        awayTeam: { select: { nameHe: true, nameEn: true } },
        competition: { select: { nameHe: true, nameEn: true } },
      },
      orderBy: [{ dateTime: 'asc' }, { id: 'asc' }],
    });
    const body = buildClubCalendar(games);
    const etag = `"${createHash('sha256').update(body).digest('hex')}"`;
    const headers = {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="hapoel-beer-sheva.ics"',
      'Cache-Control': 'public, max-age=300, s-maxage=900, stale-while-revalidate=300',
      'ETag': etag,
      'X-Content-Type-Options': 'nosniff',
    };
    const validators = request.headers.get('if-none-match')?.split(',').map((value) => value.trim().replace(/^W\//, '')) ?? [];
    if (validators.includes(etag) || validators.includes('*')) return new Response(null, { status: 304, headers });
    return new Response(body, { headers });
  } catch {
    return new Response('Calendar temporarily unavailable', { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '300' } });
  }
}
