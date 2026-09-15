import { buildClubForm, resolveHomeClubId } from '@/lib/home-club-hub';

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
