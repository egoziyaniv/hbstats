import { selectClubLeagueStanding } from '@/lib/club-hub';

it('prefers the top-flight record when the club has multiple standings in a season', () => {
  expect(selectClubLeagueStanding([
    { competitionId: 'comp_liga_leumit', position: 1, played: 33 },
    { competitionId: 'comp_liga_haal', position: 4, played: 30 },
  ])).toMatchObject({ competitionId: 'comp_liga_haal', position: 4 });
});

it('keeps a national-league record when no top-flight row exists', () => {
  expect(selectClubLeagueStanding([{ competitionId: 'comp_liga_leumit', position: 3, played: 33 }])).toMatchObject({ competitionId: 'comp_liga_leumit', position: 3 });
});
