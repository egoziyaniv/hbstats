jest.mock('@/lib/prisma', () => ({ __esModule: true, default: { season: { findMany: jest.fn() }, game: { findMany: jest.fn() } } }));
import prisma from '@/lib/prisma';
import { GET } from '../route';

const seasons = prisma.season.findMany as jest.Mock;
const games = prisma.game.findMany as jest.Mock;
beforeEach(() => { jest.clearAllMocks(); seasons.mockResolvedValue([{ id: 'current' }, { id: 'previous' }]); games.mockResolvedValue([]); });
it('returns public ICS and queries stable club identity, rolling seasons, future games and official competitions', async () => {
  const response = await GET(new Request('https://statsai.co.il/api/calendar/hapoel-beer-sheva.ics'));
  expect(response.status).toBe(200);
  expect(response.headers.get('Content-Type')).toBe('text/calendar; charset=utf-8');
  expect(response.headers.get('Cache-Control')).toContain('public');
  expect(await response.text()).toContain('BEGIN:VCALENDAR');
  expect(seasons.mock.calls[0][0]).toMatchObject({ take: 2, orderBy: { year: 'desc' }, where: { startDate: { lte: expect.any(Date) } } });
  const query = games.mock.calls[0][0];
  expect(JSON.stringify(query.where)).toContain('563');
  expect(JSON.stringify(query.where)).toContain('667');
  expect(query.where.AND).toEqual(expect.arrayContaining([{ OR: [{ seasonId: { in: ['current', 'previous'] } }, { dateTime: { gte: expect.any(Date) } }] }]));
  expect(JSON.stringify(query.where)).not.toContain('CANCELLED');
});
it('honors weak and list If-None-Match validators with a bodyless 304', async () => {
  const url = 'https://statsai.co.il/api/calendar/hapoel-beer-sheva.ics';
  const first = await GET(new Request(url));
  const second = await GET(new Request(url, { headers: { 'If-None-Match': `"other", W/${first.headers.get('ETag')}` } }));
  expect(second.status).toBe(304);
  expect(await second.text()).toBe('');
});
it('does not replace a subscribed calendar with an empty success on DB failure', async () => {
  games.mockRejectedValue(new Error('private DB details'));
  const response = await GET(new Request('https://statsai.co.il/api/calendar/hapoel-beer-sheva.ics'));
  expect(response.status).toBe(503);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(await response.text()).not.toContain('private DB details');
});
it('changes the validator when a fixture is rescheduled while preserving its identity', async () => {
  const game = { id: 'same-game', dateTime: new Date('2026-07-01T17:00:00Z'), updatedAt: new Date('2026-06-01T00:00:00Z'), status: 'SCHEDULED', statusShort: 'NS', statusLong: null, homeTeam: { nameHe: 'באר שבע', nameEn: '' }, awayTeam: { nameHe: 'חיפה', nameEn: '' }, competition: { nameHe: 'ליגה', nameEn: '' }, venueNameHe: null, venueNameEn: null };
  games.mockResolvedValue([game]);
  const url = 'https://statsai.co.il/api/calendar/hapoel-beer-sheva.ics';
  const first = await GET(new Request(url));
  games.mockResolvedValue([{ ...game, dateTime: new Date('2026-07-02T17:00:00Z'), updatedAt: new Date('2026-06-02T00:00:00Z') }]);
  const updated = await GET(new Request(url, { headers: { 'If-None-Match': first.headers.get('ETag')! } }));
  expect(updated.status).toBe(200);
  expect(updated.headers.get('ETag')).not.toBe(first.headers.get('ETag'));
  expect(await updated.text()).toContain('UID:same-game@statsai.co.il');
});
