jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    season: { findUnique: jest.fn() },
    team: { findFirst: jest.fn() },
    clubSeasonDossier: { findUnique: jest.fn() },
    game: { findMany: jest.fn() },
    standing: { findMany: jest.fn() },
    player: { findMany: jest.fn() },
    teamCoachAssignment: { findMany: jest.fn() },
    clubHonor: { findMany: jest.fn() },
  },
}));

import prisma from '@/lib/prisma';
import { buildSeasonDossier } from '@/lib/season-dossier';

const p = prisma as unknown as {
  season: { findUnique: jest.Mock };
  team: { findFirst: jest.Mock };
  clubSeasonDossier: { findUnique: jest.Mock };
  game: { findMany: jest.Mock };
  standing: { findMany: jest.Mock };
  player: { findMany: jest.Mock };
  teamCoachAssignment: { findMany: jest.Mock };
  clubHonor: { findMany: jest.Mock };
};

const league = {
  id: 'league',
  apiFootballId: 383,
  nameHe: 'ליגת העל',
  nameEn: 'Premier League',
  logoUrl: '/league.png',
  type: 'LEAGUE',
};
const cup = {
  id: 'cup',
  apiFootballId: 384,
  nameHe: 'גביע המדינה',
  nameEn: 'State Cup',
  logoUrl: null,
  type: 'CUP',
};
const friendly = {
  id: 'friendly',
  apiFootballId: 667,
  nameHe: 'ידידות',
  nameEn: 'Friendly',
  logoUrl: null,
  type: 'CUP',
};
const beerSheva = {
  id: 'team-bs',
  apiFootballId: 563,
  nameHe: 'הפועל באר שבע',
  nameEn: 'Hapoel Beer Sheva',
  logoUrl: '/bs.png',
};
const opponent = {
  id: 'team-opponent',
  apiFootballId: 900,
  nameHe: 'מכבי מבחן',
  nameEn: 'Test Maccabi',
  logoUrl: '/opponent.png',
};

function game(overrides: Record<string, unknown> = {}) {
  return {
    id: 'game-win',
    dateTime: new Date('2026-08-22T17:00:00.000Z'),
    status: 'COMPLETED',
    homeTeamId: beerSheva.id,
    awayTeamId: opponent.id,
    homeScore: 2,
    awayScore: 1,
    homeScoreRegular: null,
    awayScoreRegular: null,
    homePenalty: null,
    awayPenalty: null,
    roundNameHe: 'מחזור 1',
    roundNameEn: 'Round 1',
    competitionId: league.id,
    competition: league,
    homeTeam: beerSheva,
    awayTeam: opponent,
    ...overrides,
  };
}

function source(overrides: Record<string, unknown> = {}) {
  return {
    id: 'source-metrics',
    momentId: null,
    labelHe: 'מנהלת הליגות',
    provider: 'IPFL',
    url: 'https://example.com/league',
    scope: 'METRICS',
    competitionId: league.id,
    coverageStatus: 'COMPLETE',
    coverageFrom: new Date('2026-06-01T00:00:00.000Z'),
    coverageTo: new Date('2026-09-14T08:00:00.000Z'),
    verifiedAt: new Date('2026-09-14T08:00:00.000Z'),
    noteHe: null,
    createdAt: new Date('2026-09-14T08:00:00.000Z'),
    ...overrides,
  };
}

function dossier(overrides: Record<string, unknown> = {}) {
  return {
    id: 'dossier-1',
    introHe: 'פתיחת העונה.',
    summaryHe: 'סיכום.',
    heroImageUrl: '/hero.jpg',
    isPublished: true,
    moments: [
      {
        id: 'moment-public',
        eventDate: new Date('2026-08-22T17:00:00.000Z'),
        titleHe: 'ניצחון פתיחה',
        bodyHe: 'באר שבע פתחה בניצחון.',
        imageUrl: null,
        mediaAsset: { filePath: '/uploads/moment.jpg' },
        displayOrder: 1,
        isPublished: true,
        gameId: 'game-win',
      },
      {
        id: 'moment-draft',
        eventDate: new Date('2026-08-28T17:00:00.000Z'),
        titleHe: 'טיוטה',
        bodyHe: 'רגע שטרם פורסם.',
        imageUrl: '/draft.jpg',
        mediaAsset: null,
        displayOrder: 2,
        isPublished: false,
        gameId: 'game-draw',
      },
    ],
    sources: [
      source(),
      source({
        id: 'source-editorial',
        labelHe: 'כתבת רקע',
        scope: 'EDITORIAL',
        competitionId: null,
      }),
      source({ id: 'source-public-moment', momentId: 'moment-public', scope: 'EDITORIAL' }),
      source({ id: 'source-draft-moment', momentId: 'moment-draft', scope: 'EDITORIAL' }),
    ],
    ...overrides,
  };
}

function arrange(year = 2026, seasonDates: { startDate?: Date; endDate?: Date } = {}) {
  p.season.findUnique.mockResolvedValue({
    id: `season-${year}`,
    year,
    name: `${year}/${String(year + 1).slice(-2)}`,
    startDate: seasonDates.startDate ?? new Date(`${year}-07-01T00:00:00.000Z`),
    endDate: seasonDates.endDate ?? new Date(`${year + 1}-06-30T23:59:59.999Z`),
  });
  p.team.findFirst.mockResolvedValue(beerSheva);
  p.clubSeasonDossier.findUnique.mockResolvedValue(dossier());
  p.game.findMany.mockResolvedValue([
    game({
      id: 'game-future',
      dateTime: new Date('2026-09-20T17:00:00.000Z'),
      status: 'SCHEDULED',
      homeScore: null,
      awayScore: null,
      roundNameHe: null,
      roundNameEn: 'Round 2',
    }),
    game({
      id: 'game-draw',
      dateTime: new Date('2026-08-28T17:00:00.000Z'),
      homeTeamId: opponent.id,
      awayTeamId: beerSheva.id,
      homeScore: 0,
      awayScore: 0,
      roundNameHe: 'סיבוב ראשון',
      competitionId: cup.id,
      competition: cup,
      homeTeam: opponent,
      awayTeam: beerSheva,
    }),
    game(),
    game({
      id: 'game-friendly',
      competitionId: friendly.id,
      competition: friendly,
    }),
  ]);
  p.standing.findMany.mockResolvedValue([
    {
      position: 9,
      played: 2,
      wins: 0,
      draws: 0,
      losses: 2,
      goalsFor: 0,
      goalsAgainst: 4,
      points: 0,
      competitionId: 'comp_liga_haal',
      competition: { ...league, id: 'comp_liga_haal', apiFootballId: null },
    },
    {
      position: 2,
      played: 3,
      wins: 2,
      draws: 1,
      losses: 0,
      goalsFor: 5,
      goalsAgainst: 2,
      points: 7,
      competitionId: league.id,
      competition: league,
    },
  ]);
  p.player.findMany.mockResolvedValue([
    {
      id: 'player-1',
      nameHe: 'שחקן אחד',
      nameEn: 'Player One',
      photoUrl: '/player.png',
      position: 'Midfielder',
      jerseyNumber: 8,
      playerStats: [
        { id: 'stat-league', competitionId: 'league', updatedAt: new Date('2026-09-12T00:00:00.000Z'), appearances: 2, gamesPlayed: 2, starts: 2, minutesPlayed: 180, goals: 1, assists: 1, position: 'Midfielder' },
        { id: 'stat-cup', competitionId: 'cup', updatedAt: new Date('2026-09-13T00:00:00.000Z'), appearances: null, gamesPlayed: 1, starts: 1, minutesPlayed: 90, goals: 2, assists: 0, position: 'Midfielder' },
      ],
    },
    {
      id: 'player-2',
      nameHe: 'שחקן ללא נתונים',
      nameEn: 'Player Two',
      photoUrl: null,
      position: 'Goalkeeper',
      jerseyNumber: 1,
      playerStats: [],
    },
  ]);
  p.teamCoachAssignment.findMany.mockResolvedValue([{
    id: 'assignment-current',
    coachId: 'coach-1',
    apiFootballCoachId: null,
    coachNameHe: 'רן מאמן',
    coachNameEn: 'Ran Coach',
    startDate: new Date('2026-07-01T00:00:00.000Z'),
    endDate: null,
    coach: { id: 'coach-1', nameHe: 'רן מאמן', nameEn: 'Ran Coach', photoUrl: '/coach.png' },
  }]);
  p.clubHonor.findMany.mockResolvedValue([
    { competitionHe: 'אלוף האלופים', place: 'WINNER' },
  ]);
}

describe('buildSeasonDossier', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-14T08:00:00.000Z'));
    for (const delegate of Object.values(p)) {
      for (const mock of Object.values(delegate)) (mock as jest.Mock).mockReset();
    }
    arrange();
  });

  afterEach(() => jest.useRealTimers());

  it('gates the pilot to 2025 and 2026 and resolves Beer Sheva in the requested season', async () => {
    p.season.findUnique.mockResolvedValueOnce({ id: 'season-2024', year: 2024, name: '2024/25' });
    expect(await buildSeasonDossier('season-2024')).toBeNull();
    expect(p.team.findFirst).not.toHaveBeenCalled();

    arrange(2026);
    await buildSeasonDossier('season-2026');
    expect(p.team.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { seasonId: 'season-2026', apiFootballId: 563 },
    }));

    p.team.findFirst.mockResolvedValueOnce(null);
    expect(await buildSeasonDossier('season-2026')).toBeNull();
  });

  it.each([
    [2026, 'CURRENT'],
    [2025, 'FINAL'],
  ])('maps pilot year %i to %s season state', async (year, expectedStatus) => {
    arrange(year);
    const payload = await buildSeasonDossier(`season-${year}`);
    expect(payload?.status).toBe(expectedStatus);
  });

  it('assembles automatic data once with matching metric evidence and no friendlies', async () => {
    const payload = await buildSeasonDossier('season-2026');

    expect(payload).toMatchObject({
      season: { id: 'season-2026', year: 2026, name: '2026/27' },
      team: { id: 'team-bs', apiId: 563, nameHe: 'הפועל באר שבע' },
      status: 'CURRENT',
      asOf: '2026-09-14T08:00:00.000Z',
      squad: [
        { playerId: 'player-2', appearances: null, starts: null, minutes: null, goals: null, assists: null },
        { playerId: 'player-1', appearances: 3, starts: 3, minutes: 270, goals: 3, assists: 1 },
      ],
      coach: { id: 'coach-1', nameHe: 'רן מאמן', nameEn: 'Ran Coach', photoUrl: '/coach.png' },
      standing: { competitionId: 'league', competitionNameHe: 'ליגת העל', position: 2, coverage: 'COMPLETE' },
      honors: [{ competitionHe: 'אלוף האלופים', place: 'WINNER' }],
      competitions: [
        { id: 'league', nameHe: 'ליגת העל', type: 'LEAGUE' },
        { id: 'cup', nameHe: 'גביע המדינה', type: 'CUP' },
      ],
    });
    expect(payload?.metrics.map((metric) => [metric.key, metric.value])).toEqual([
      ['matches', 2],
      ['wins', 1],
      ['goalsFor', 2],
      ['leaguePosition', 2],
    ]);
    const displayedEvidence = payload?.games.flatMap((group) => group.games) ?? [];
    expect(displayedEvidence.map((row) => row.id)).toEqual(['game-win', 'game-draw', 'game-future']);
    expect(payload?.metrics.slice(0, 3).every((metric) =>
      metric.evidenceGameIds.every((id) => displayedEvidence.some((gameRow) => gameRow.id === id)),
    )).toBe(true);
    expect(payload?.metrics[3].evidenceGameIds).toEqual([]);
    expect(payload?.moments[0].game).toEqual(displayedEvidence.find((row) => row.id === 'game-win'));
    expect(payload?.games).toEqual([
      expect.objectContaining({ competitionId: 'league', labelHe: 'מחזור 1' }),
      expect.objectContaining({ competitionId: 'cup', labelHe: 'סיבוב ראשון' }),
      expect.objectContaining({ competitionId: 'league', labelHe: 'Round 2' }),
    ]);
    expect(new Set(displayedEvidence.map((row) => row.id)).size).toBe(displayedEvidence.length);
    expect(p.game.findMany).toHaveBeenCalledTimes(1);
    expect(p.game.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        competition: {
          is: {
            OR: [
              { apiFootballId: null },
              { apiFootballId: { not: 667 } },
            ],
          },
        },
      }),
    }));
    expect(p.game.findMany).toHaveBeenCalledWith(expect.objectContaining({
      orderBy: [{ dateTime: 'asc' }, { id: 'asc' }],
    }));
  });

  it('uses only the latest deterministic aggregate player row when scoped rows also exist', async () => {
    p.player.findMany.mockResolvedValueOnce([{
      id: 'player-mixed',
      nameHe: 'שחקן משולב',
      nameEn: 'Mixed Player',
      photoUrl: null,
      position: null,
      jerseyNumber: 9,
      playerStats: [
        { id: 'scoped', competitionId: 'league', updatedAt: new Date('2026-09-14T00:00:00.000Z'), appearances: 4, gamesPlayed: 4, starts: 3, minutesPlayed: 300, goals: 2, assists: 1, position: 'Forward' },
        { id: 'z-aggregate', competitionId: null, updatedAt: new Date('2026-09-13T00:00:00.000Z'), appearances: 7, gamesPlayed: 7, starts: 5, minutesPlayed: 500, goals: 4, assists: 2, position: 'Forward' },
        { id: 'a-aggregate', competitionId: null, updatedAt: new Date('2026-09-13T00:00:00.000Z'), appearances: 8, gamesPlayed: 8, starts: 6, minutesPlayed: 600, goals: 5, assists: 3, position: 'Forward' },
      ],
    }]);

    const payload = await buildSeasonDossier('season-2026');
    expect(payload?.squad[0]).toMatchObject({
      appearances: 8,
      starts: 6,
      minutes: 600,
      goals: 5,
      assists: 3,
    });
  });

  it('sums scoped player rows when no aggregate row exists', async () => {
    const payload = await buildSeasonDossier('season-2026');
    expect(payload?.squad.find((player) => player.playerId === 'player-1')).toMatchObject({
      appearances: 3,
      starts: 3,
      minutes: 270,
      goals: 3,
      assists: 1,
    });
  });

  it('hides draft editorial, moments, and moment sources from public payloads', async () => {
    const payload = await buildSeasonDossier('season-2026');
    expect(payload?.editorial).toEqual({
      introHe: 'פתיחת העונה.',
      summaryHe: 'סיכום.',
      heroImageUrl: '/hero.jpg',
    });
    expect(payload?.sources.map((row) => row.id)).toEqual(['source-editorial', 'source-metrics']);
    expect(payload?.moments.map((row) => row.id)).toEqual(['moment-public']);
    expect(payload?.moments[0].sources.map((row) => row.id)).toEqual(['source-public-moment']);

    p.clubSeasonDossier.findUnique.mockResolvedValueOnce(dossier({ isPublished: false }));
    const hidden = await buildSeasonDossier('season-2026');
    expect(hidden?.editorial).toBeNull();
    expect(hidden?.sources).toEqual([]);
    expect(hidden?.moments).toEqual([]);
    expect(hidden?.metrics[0].coverage).toBe('PARTIAL');
  });

  it('includes draft dossier content for admin previews and keeps sources on their moments', async () => {
    p.clubSeasonDossier.findUnique.mockResolvedValueOnce(dossier({ isPublished: false }));
    const payload = await buildSeasonDossier('season-2026', { includeDrafts: true });

    expect(payload?.editorial?.introHe).toBe('פתיחת העונה.');
    expect(payload?.moments.map((row) => row.id)).toEqual(['moment-public', 'moment-draft']);
    expect(payload?.moments[0].sources.map((row) => row.id)).toEqual(['source-public-moment']);
    expect(payload?.moments[1].sources.map((row) => row.id)).toEqual(['source-draft-moment']);
  });

  it('uses assignment identity and API-Football image when no canonical coach is linked', async () => {
    p.teamCoachAssignment.findMany.mockResolvedValueOnce([{
      id: 'assignment-interim',
      coachId: null,
      apiFootballCoachId: 42,
      coachNameHe: 'מאמן זמני',
      coachNameEn: 'Interim Coach',
      startDate: null,
      endDate: null,
      coach: null,
    }]);

    const payload = await buildSeasonDossier('season-2026');
    expect(payload?.coach).toEqual({
      id: null,
      nameHe: 'מאמן זמני',
      nameEn: 'Interim Coach',
      photoUrl: 'https://media.api-sports.io/football/coachs/42.png',
      startDate: null,
      endDate: null,
    });
  });

  it('selects the latest dated coach ahead of undated and older assignments', async () => {
    p.teamCoachAssignment.findMany.mockResolvedValueOnce([
      {
        id: 'assignment-undated', coachId: null, apiFootballCoachId: null,
        coachNameHe: 'ללא תאריך', coachNameEn: 'Undated', startDate: null, endDate: null, coach: null,
      },
      {
        id: 'assignment-old', coachId: null, apiFootballCoachId: null,
        coachNameHe: 'ישן', coachNameEn: 'Old', startDate: new Date('2026-01-01T00:00:00.000Z'), endDate: null, coach: null,
      },
      {
        id: 'assignment-latest', coachId: null, apiFootballCoachId: null,
        coachNameHe: 'חדש', coachNameEn: 'Latest', startDate: new Date('2026-07-01T00:00:00.000Z'), endDate: null, coach: null,
      },
    ]);

    const payload = await buildSeasonDossier('season-2026');
    expect(payload?.coach?.nameEn).toBe('Latest');
    expect(p.teamCoachAssignment.findMany).toHaveBeenCalledWith(expect.objectContaining({
      orderBy: [
        { startDate: { sort: 'desc', nulls: 'last' } },
        { id: 'asc' },
      ],
    }));
  });

  it('downgrades mapped COMPLETE sources whose dates do not cover the effective season window', async () => {
    p.clubSeasonDossier.findUnique.mockResolvedValueOnce(dossier({
      sources: [source({ coverageFrom: new Date('2026-08-01T00:00:00.000Z') })],
    }));

    const payload = await buildSeasonDossier('season-2026');
    expect(payload?.sources[0]).toMatchObject({
      coverageFrom: '2026-08-01T00:00:00.000Z',
      coverageTo: '2026-09-14T08:00:00.000Z',
      verifiedAt: '2026-09-14T08:00:00.000Z',
    });
    expect(payload?.standing?.coverage).toBe('PARTIAL');
  });

  it('derives season state from the season boundaries at the shared as-of instant', async () => {
    arrange(2026, { endDate: new Date('2026-09-13T23:59:59.999Z') });
    expect((await buildSeasonDossier('season-2026'))?.status).toBe('FINAL');

    arrange(2025, { endDate: new Date('2026-10-01T00:00:00.000Z') });
    expect((await buildSeasonDossier('season-2025'))?.status).toBe('CURRENT');
  });

  it('keeps automatic data available with unknown coverage when no dossier exists', async () => {
    p.clubSeasonDossier.findUnique.mockResolvedValueOnce(null);
    const payload = await buildSeasonDossier('season-2026');
    expect(payload?.editorial).toBeNull();
    expect(payload?.moments).toEqual([]);
    expect(payload?.sources).toEqual([]);
    expect(payload?.metrics[0]).toMatchObject({ value: 2, coverage: 'PARTIAL' });
  });
});
