import { buildClubForm, buildClubSeasonSnapshot, buildClubTrend, resolveHomeClubId } from '@/lib/home-club-hub';

const teams = [
  { id: 'hbs', apiFootballId: 563 },
  { id: 'other', apiFootballId: 999 },
];

describe('resolveHomeClubId', () => {
  it('uses an explicit team before the saved favourite and Hapoel Be’er Sheva fallback', () => {
    expect(resolveHomeClubId(['other'], ['hbs'], teams)).toBe('other');
    expect(resolveHomeClubId([], ['other'], teams)).toBe('other');
    expect(resolveHomeClubId([], [], teams)).toBe('hbs');
  });

  it('returns null when the fallback club is absent from the season', () => {
    expect(resolveHomeClubId([], [], [{ id: 'other', apiFootballId: 999 }])).toBeNull();
  });
});

describe('buildClubForm', () => {
  it('uses only completed games and orients away scores to the selected club', () => {
    expect(
      buildClubForm('hbs', [
        { status: 'SCHEDULED', homeTeamId: 'hbs', awayTeamId: 'other', homeScore: null, awayScore: null },
        { status: 'COMPLETED', homeTeamId: 'other', awayTeamId: 'hbs', homeScore: 0, awayScore: 2 },
        { status: 'COMPLETED', homeTeamId: 'hbs', awayTeamId: 'other', homeScore: 1, awayScore: 1 },
      ]),
    ).toEqual(['W', 'D']);
  });
});

describe('buildClubSeasonSnapshot', () => {
  it('calculates completed-match totals without treating missing scores as zero', () => {
    expect(
      buildClubSeasonSnapshot('hbs', [
        { status: 'COMPLETED', homeTeamId: 'hbs', awayTeamId: 'other', homeScore: 3, awayScore: 1 },
        { status: 'COMPLETED', homeTeamId: 'other', awayTeamId: 'hbs', homeScore: 0, awayScore: 2 },
        { status: 'SCHEDULED', homeTeamId: 'hbs', awayTeamId: 'other', homeScore: null, awayScore: null },
      ]),
    ).toEqual({ matches: 2, wins: 2, draws: 0, losses: 0, goalsFor: 5, goalsAgainst: 1 });
  });
});

describe('buildClubTrend', () => {
  it('returns cumulative points in completed match order', () => {
    expect(
      buildClubTrend('hbs', [
        { status: 'COMPLETED', homeTeamId: 'hbs', awayTeamId: 'other', homeScore: 0, awayScore: 1 },
        { status: 'COMPLETED', homeTeamId: 'hbs', awayTeamId: 'other', homeScore: 2, awayScore: 0 },
        { status: 'COMPLETED', homeTeamId: 'other', awayTeamId: 'hbs', homeScore: 1, awayScore: 1 },
      ]),
    ).toEqual([
      { match: 1, points: 0 },
      { match: 2, points: 3 },
      { match: 3, points: 4 },
    ]);
  });
});

describe('pickClubArchiveGame', () => {
  it('chooses the most recent completed game from an earlier season for the selected club', async () => {
    const { pickClubArchiveGame } = await import('@/lib/home-club-hub');
    expect(pickClubArchiveGame('hbs', 'current', [
      { id: 'current-game', seasonId: 'current', status: 'COMPLETED', homeTeamId: 'hbs', awayTeamId: 'other', dateTime: new Date('2026-09-01') },
      { id: 'older-game', seasonId: 'previous', status: 'COMPLETED', homeTeamId: 'other', awayTeamId: 'hbs', dateTime: new Date('2026-05-01') },
      { id: 'scheduled', seasonId: 'previous', status: 'SCHEDULED', homeTeamId: 'hbs', awayTeamId: 'other', dateTime: new Date('2026-05-02') },
    ])).toMatchObject({ id: 'older-game' });
  });

  it('returns null when there is no completed historical match for the club', async () => {
    const { pickClubArchiveGame } = await import('@/lib/home-club-hub');
    expect(pickClubArchiveGame('hbs', 'current', [
      { id: 'scheduled', seasonId: 'previous', status: 'SCHEDULED', homeTeamId: 'hbs', awayTeamId: 'other', dateTime: new Date('2026-05-02') },
    ])).toBeNull();
  });
});
