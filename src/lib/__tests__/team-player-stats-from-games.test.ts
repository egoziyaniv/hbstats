import { teamPlayerTotalsFromGames, gamesHaveLineupsFor, TeamStatsGame } from '../team-player-stats-from-games';

const T = 'team';
const squad = new Set(['gk', 'a', 'b', 'c']);
const resolve = (id: string) => (squad.has(id) ? id : null);
const xi = (ids: string[]) => ids.map((playerId) => ({ playerId, role: 'STARTER', teamId: T }));

describe('teamPlayerTotalsFromGames', () => {
  it('counts a starter in every game he started', () => {
    const games: TeamStatsGame[] = [1, 2, 3].map(() => ({ lineupEntries: xi(['gk', 'a']), events: [] }));
    const t = teamPlayerTotalsFromGames(games, T, resolve);
    expect(t.get('gk')?.gamesPlayed).toBe(3);
    expect(t.get('gk')?.starts).toBe(3);
  });

  it('counts a substitution once even when both sources record it', () => {
    const games: TeamStatsGame[] = [{
      lineupEntries: xi(['a']),
      events: [
        { type: 'SUBSTITUTION_OUT', playerId: 'a', relatedPlayerId: 'b' },
        { type: 'SUBSTITUTION_IN', playerId: 'b', relatedPlayerId: 'a' },
      ],
    }];
    const t = teamPlayerTotalsFromGames(games, T, resolve);
    expect(t.get('b')?.gamesPlayed).toBe(1);
    expect(t.get('b')?.subbedIn).toBe(1);
    expect(t.get('a')?.subbedOut).toBe(1);
    expect(t.get('a')?.gamesPlayed).toBe(1);
  });

  it('reads the assist from relatedPlayerId on a goal', () => {
    const games: TeamStatsGame[] = [{
      lineupEntries: xi(['a', 'b']),
      events: [{ type: 'GOAL', playerId: 'a', relatedPlayerId: 'b' }],
    }];
    const t = teamPlayerTotalsFromGames(games, T, resolve);
    expect(t.get('a')?.goals).toBe(1);
    expect(t.get('b')?.assists).toBe(1);
    expect(t.get('b')?.goals ?? 0).toBe(0);
  });

  it('treats relatedPlayerId as the scorer when playerId is missing', () => {
    const games: TeamStatsGame[] = [{
      lineupEntries: xi(['a']),
      events: [{ type: 'GOAL', playerId: null, relatedPlayerId: 'a' }],
    }];
    const t = teamPlayerTotalsFromGames(games, T, resolve);
    expect(t.get('a')?.goals).toBe(1);
    expect(t.get('a')?.assists ?? 0).toBe(0);
  });

  it('ignores opponents and the other team lineup', () => {
    const games: TeamStatsGame[] = [{
      lineupEntries: [...xi(['a']), { playerId: 'x', role: 'STARTER', teamId: 'other' }],
      events: [{ type: 'GOAL', playerId: 'x', relatedPlayerId: null }, { type: 'YELLOW_CARD', playerId: 'c', relatedPlayerId: null }],
    }];
    const t = teamPlayerTotalsFromGames(games, T, resolve);
    expect(t.has('x')).toBe(false);
    expect(t.get('c')?.yellowCards).toBe(1);
    expect(t.get('c')?.gamesPlayed ?? 0).toBe(0);
  });
});

describe('gamesHaveLineupsFor', () => {
  it('requires a full XI in every game', () => {
    const full = { lineupEntries: xi(Array.from({ length: 11 }, (_, i) => `p${i}`)), events: [] };
    const thin = { lineupEntries: xi(['a']), events: [] };
    expect(gamesHaveLineupsFor([full, full], T)).toBe(true);
    expect(gamesHaveLineupsFor([full, thin], T)).toBe(false);
    expect(gamesHaveLineupsFor([], T)).toBe(false);
  });
});
