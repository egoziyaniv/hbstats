jest.mock('@/lib/prisma', () => ({ __esModule: true, default: {} }));
import {
  recordOf, controlOf, timingOf, gameLines, pointsProgression, orderedGoals, bucketOf, SnapGame,
} from '../team-season-snapshot';

const T = 'bs';
let n = 0;
const game = (p: Partial<SnapGame>): SnapGame => ({
  id: `g${++n}`, dateTime: new Date(`2026-09-${String(n).padStart(2, '0')}T17:00:00Z`),
  homeTeamId: T, awayTeamId: 'opp', homeScore: 0, awayScore: 0,
  competitionId: 'lg', competitionName: 'ליגת העל', competitionType: 'LEAGUE', roundLabel: null,
  opponentName: 'יריבה', opponentLogo: null, stats: null, teamStats: null, goals: [], ...p,
});

describe('recordOf', () => {
  it('reads results from our side whether home or away', () => {
    const r = recordOf(T, [
      game({ homeScore: 2, awayScore: 0 }),
      game({ homeTeamId: 'opp', awayTeamId: T, homeScore: 1, awayScore: 3 }),
      game({ homeScore: 1, awayScore: 1 }),
      game({ homeTeamId: 'opp', awayTeamId: T, homeScore: 2, awayScore: 0 }),
    ]);
    expect(r).toEqual({ played: 4, wins: 2, draws: 1, losses: 1, goalsFor: 6, goalsAgainst: 4, cleanSheets: 1, failedToScore: 1 });
  });
});

describe('own goals', () => {
  it('credit the team on the event — the one that benefits', () => {
    const g = game({
      homeScore: 1, awayScore: 0,
      goals: [{ type: 'OWN_GOAL', minute: 30, extraMinute: null, teamId: T, playerId: 'x' }],
    });
    expect(timingOf(T, [g]).scored[1]).toBe(1);
    expect(gameLines(T, [g])[0].firstGoal).toBe('us');
  });
});

describe('timing', () => {
  it('puts stoppage time in the last bucket and de-duplicates a goal two sources recorded', () => {
    const g = game({
      homeScore: 1, awayScore: 1,
      goals: [
        { type: 'GOAL', minute: 90, extraMinute: 3, teamId: 'opp', playerId: 'o1' },
        { type: 'GOAL', minute: 90, extraMinute: 3, teamId: 'opp', playerId: 'o1' },
        { type: 'GOAL', minute: 12, extraMinute: null, teamId: T, playerId: 'b1' },
      ],
    });
    const t = timingOf(T, [g]);
    expect(t.scored).toEqual([1, 0, 0, 0, 0, 0]);
    expect(t.conceded).toEqual([0, 0, 0, 0, 0, 1]);
    expect(t.coverage).toBe(1);
    expect(bucketOf(46)).toBe(3);
    expect(orderedGoals(g)).toHaveLength(2);
  });
});

describe('controlOf', () => {
  it('averages our side against theirs and derives conversion and save rate', () => {
    const away = game({
      homeTeamId: 'opp', awayTeamId: T, homeScore: 1, awayScore: 2,
      stats: { homePossession: 30, awayPossession: 70, homeShots: 5, awayShots: 15, homeShotsOnTarget: 2, awayShotsOnTarget: 4, homeXg: null, awayXg: null },
      teamStats: [{ label: 'Big chances', home: '1', away: '3' }, { label: 'Big chances', home: '9', away: '9' }],
    });
    const c = controlOf(T, [away]);
    expect(c.possession).toEqual({ us: 70, them: 30, games: 1 });
    expect(c.bigChances).toEqual({ us: 3, them: 1, games: 1 }); // first occurrence of a repeated label
    expect(c.conversion).toBe(50); // 2 goals / 4 on target
    expect(c.savePct).toBe(50);    // 1 conceded / 2 faced
  });
});

describe('pointsProgression', () => {
  it('accumulates league points game by game', () => {
    const lines = gameLines(T, [game({ homeScore: 1, awayScore: 0 }), game({ homeScore: 1, awayScore: 1 }), game({ homeScore: 0, awayScore: 2 })]);
    expect(pointsProgression(lines).map((p) => p.points)).toEqual([3, 4, 4]);
  });
});
