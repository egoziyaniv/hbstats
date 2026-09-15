import { excludeUnavailablePlayers } from '@/lib/predicted-lineup';

describe('excludeUnavailablePlayers', () => {
  it('removes suspended and injured players before a predicted XI is selected', () => {
    const players = [
      { playerId: 'available', apiFootballId: 1 },
      { playerId: 'suspended', apiFootballId: 2 },
      { playerId: 'injured', apiFootballId: 3 },
    ];
    expect(excludeUnavailablePlayers(players, new Set(['suspended']), new Set([3]))).toEqual([
      { playerId: 'available', apiFootballId: 1 },
    ]);
  });
});
