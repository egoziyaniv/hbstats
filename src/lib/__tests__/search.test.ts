jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    team: { findMany: jest.fn() },
    player: { findMany: jest.fn() },
    game: { findMany: jest.fn() },
    venue: { findMany: jest.fn() },
  },
}));

import prisma from '@/lib/prisma';
import { searchEntities } from '@/lib/search';

const p = prisma as unknown as {
  team: { findMany: jest.Mock };
  player: { findMany: jest.Mock };
  game: { findMany: jest.Mock };
  venue: { findMany: jest.Mock };
};

describe('searchEntities', () => {
  beforeEach(() => {
    p.team.findMany.mockReset();
    p.player.findMany.mockReset();
    p.game.findMany.mockReset();
    p.venue.findMany.mockReset();
  });

  it('maps all four entity types with the expected label/subtitle/href shape', async () => {
    p.team.findMany.mockResolvedValue([
      { id: 't1', nameHe: 'מכבי תל אביב', nameEn: 'Maccabi Tel Aviv' },
    ]);
    p.player.findMany.mockResolvedValue([
      {
        id: 'p1',
        nameHe: 'עומר אצילי',
        nameEn: 'Omer Atzili',
        canonicalPlayerId: null,
        team: { nameHe: 'מכבי תל אביב', nameEn: 'Maccabi Tel Aviv' },
      },
    ]);
    p.game.findMany.mockResolvedValue([
      {
        id: 'g1',
        dateTime: new Date('2024-03-01T18:00:00Z'),
        homeTeam: { nameHe: 'מכבי תל אביב', nameEn: 'Maccabi Tel Aviv' },
        awayTeam: { nameHe: 'הפועל באר שבע', nameEn: 'Hapoel Beer Sheva' },
      },
    ]);
    p.venue.findMany.mockResolvedValue([
      { id: 'v1', nameHe: 'בלומפילד', nameEn: 'Bloomfield', cityHe: 'תל אביב', cityEn: 'Tel Aviv' },
    ]);

    const results = await searchEntities('מכבי');

    expect(results).toHaveLength(4);

    const team = results.find((r) => r.type === 'team')!;
    expect(team).toMatchObject({
      id: 't1',
      type: 'team',
      label: 'מכבי תל אביב',
      subtitle: 'Maccabi Tel Aviv',
      href: '/teams/t1',
    });

    const player = results.find((r) => r.type === 'player')!;
    expect(player).toMatchObject({
      id: 'p1',
      type: 'player',
      label: 'עומר אצילי',
      subtitle: 'מכבי תל אביב',
      href: '/players/p1', // no canonicalPlayerId -> falls back to the raw player id
    });

    const game = results.find((r) => r.type === 'game')!;
    expect(game).toMatchObject({
      id: 'g1',
      type: 'game',
      label: 'מכבי תל אביב מול הפועל באר שבע',
      href: '/games/g1',
    });
    expect(game.subtitle).toBeTruthy();

    const venue = results.find((r) => r.type === 'venue')!;
    expect(venue).toMatchObject({
      id: 'v1',
      type: 'venue',
      label: 'בלומפילד',
      subtitle: 'תל אביב',
      href: `/venues?q=${encodeURIComponent('בלומפילד')}`,
    });
  });

  it('routes a merged player to their canonicalPlayerId, not the raw row id', async () => {
    p.team.findMany.mockResolvedValue([]);
    p.game.findMany.mockResolvedValue([]);
    p.venue.findMany.mockResolvedValue([]);
    p.player.findMany.mockResolvedValue([
      {
        id: 'p-duplicate',
        nameHe: 'דור פרץ',
        nameEn: 'Dor Peretz',
        canonicalPlayerId: 'p-canonical',
        team: null,
      },
    ]);

    const results = await searchEntities('דור');

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      id: 'p-duplicate',
      type: 'player',
      href: '/players/p-canonical',
    });
  });

  it('returns an empty array when nothing matches in any table', async () => {
    p.team.findMany.mockResolvedValue([]);
    p.player.findMany.mockResolvedValue([]);
    p.game.findMany.mockResolvedValue([]);
    p.venue.findMany.mockResolvedValue([]);

    expect(await searchEntities('zzz-no-match')).toEqual([]);
  });
});
