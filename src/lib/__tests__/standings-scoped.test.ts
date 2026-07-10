import { buildScopedTable } from '@/lib/standings-from-games';

const team = (id: string, nameHe: string) => ({ id, nameHe, nameEn: nameHe, logoUrl: null });
const game = (homeTeamId: string, awayTeamId: string, homeScore: number, awayScore: number) => ({
  homeTeamId, awayTeamId, homeScore, awayScore, roundNameEn: null,
});

describe('buildScopedTable', () => {
  const teams = [team('a', 'מכבי'), team('b', 'הפועל'), team('c', 'בית"ר')];
  // a beat b 3-0 at home; b beat a 2-1 at home; c drew both its home games
  const games = [
    game('a', 'b', 3, 0),
    game('b', 'a', 2, 1),
    game('c', 'a', 1, 1),
    game('c', 'b', 0, 0),
  ];

  it('home scope counts only home legs', () => {
    const rows = buildScopedTable(teams, games, 'home');
    const a = rows.find((r) => r.teamId === 'a')!;
    expect(a.played).toBe(1);           // only the a-b home game
    expect(a.wins).toBe(1);
    expect(a.points).toBe(3);
    expect(a.goalsFor).toBe(3);
    const c = rows.find((r) => r.teamId === 'c')!;
    expect(c.played).toBe(2);           // both c home games
    expect(c.draws).toBe(2);
    expect(c.points).toBe(2);
  });

  it('away scope counts only away legs', () => {
    const rows = buildScopedTable(teams, games, 'away');
    const b = rows.find((r) => r.teamId === 'b')!;
    expect(b.played).toBe(2);           // away at a (0-3 L) and at c (0-0 D)
    expect(b.losses).toBe(1);
    expect(b.draws).toBe(1);
    expect(b.points).toBe(1);
  });

  it('renumbers positions 1..N by points then goal difference', () => {
    const rows = buildScopedTable(teams, games, 'home');
    expect(rows.map((r) => r.position)).toEqual([1, 2, 3]);
    expect(rows[0].teamId).toBe('a');   // 3 pts, +3
  });

  it('skips games without scores', () => {
    const rows = buildScopedTable(teams, [{ homeTeamId: 'a', awayTeamId: 'b', homeScore: null, awayScore: null, roundNameEn: null }], 'home');
    expect(rows.find((r) => r.teamId === 'a')!.played).toBe(0);
  });

  it('seeds a played-0 row for every provided team, even without games in the list', () => {
    // Documents the seed behavior: the CALLER must pass league teams only —
    // any team passed in appears in the table (the route filters to
    // Standing/game participants for this reason).
    const rows = buildScopedTable([...teams, team('d', 'עירוני')], games, 'home');
    expect(rows).toHaveLength(4);
    const d = rows.find((r) => r.teamId === 'd')!;
    expect(d.played).toBe(0);
    expect(d.points).toBe(0);
    expect(d.position).toBe(4); // sorted to the bottom, still numbered
  });

  it('ignores games whose scoped team is not in teams', () => {
    // 'x' is a cup opponent outside the league — its home game must neither
    // crash nor add a row; 'a' as the away side is untouched in home scope.
    const rows = buildScopedTable(teams, [...games, game('x', 'a', 5, 0)], 'home');
    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r.teamId === 'x')).toBeUndefined();
    const a = rows.find((r) => r.teamId === 'a')!;
    expect(a.played).toBe(1); // still only its own home leg
  });
});
