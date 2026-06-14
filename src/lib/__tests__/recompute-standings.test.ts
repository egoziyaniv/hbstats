import { recomputeStoredStandings } from '@/lib/standings-from-games';

type Row = {
  id: string;
  teamId: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  position: number;
  pointsAdjustment: number;
  pointsAdjustmentNoteHe: string | null;
  groupNameEn: string | null;
};

function makeTx(rows: Row[], games: any[]) {
  const updates: Array<{ id: string; data: any }> = [];
  const tx = {
    standing: {
      findMany: jest.fn().mockResolvedValue(rows),
      update: jest.fn(async ({ where, data }: any) => {
        updates.push({ id: where.id, data });
        return {};
      }),
    },
    game: {
      findMany: jest.fn().mockResolvedValue(games),
    },
  };
  return { tx, updates };
}

const base = (over: Partial<Row>): Row => ({
  id: over.teamId! + '-row', teamId: over.teamId!, played: 0, wins: 0, draws: 0, losses: 0,
  goalsFor: 0, goalsAgainst: 0, points: 0, position: 0, pointsAdjustment: 0,
  pointsAdjustmentNoteHe: null, groupNameEn: null, ...over,
});

describe('recomputeStoredStandings', () => {
  it('recomputes W/D/L/points/GD and re-sorts positions from completed games', async () => {
    const rows = [
      base({ teamId: 'A', position: 2, played: 0 }),
      base({ teamId: 'B', position: 1, played: 0 }),
    ];
    // A beats B 2-0
    const games = [{ homeTeamId: 'A', awayTeamId: 'B', homeScore: 2, awayScore: 0 }];
    const { tx, updates } = makeTx(rows, games);

    const n = await recomputeStoredStandings(tx as any, 's1', 'comp_liga_haal');
    expect(n).toBe(2);
    const a = updates.find((u) => u.id === 'A-row')!.data;
    const b = updates.find((u) => u.id === 'B-row')!.data;
    expect(a).toMatchObject({ played: 1, wins: 1, losses: 0, points: 3, goalsFor: 2, goalsAgainst: 0, position: 1 });
    expect(b).toMatchObject({ played: 1, wins: 0, losses: 1, points: 0, goalsFor: 0, goalsAgainst: 2, position: 2 });
  });

  it('GUARD: never reduces played when games are incomplete vs stored standings', async () => {
    // Stored row says 30 games played (imported from IFA); only 1 game in DB.
    const rows = [base({ teamId: 'A', played: 30, wins: 20, points: 65 })];
    const games = [{ homeTeamId: 'A', awayTeamId: 'Z', homeScore: 1, awayScore: 0 }];
    const { tx, updates } = makeTx(rows, games);

    const n = await recomputeStoredStandings(tx as any, 's1', 'comp_liga_haal');
    expect(n).toBe(0); // derived played (1) < stored (30) → skipped, authoritative preserved
    expect(updates).toHaveLength(0);
  });

  it('preserves pointsAdjustment and does not write it away', async () => {
    const rows = [
      base({ teamId: 'A', position: 1, pointsAdjustment: -2, pointsAdjustmentNoteHe: 'עונש' }),
      base({ teamId: 'B', position: 2 }),
    ];
    const games = [{ homeTeamId: 'A', awayTeamId: 'B', homeScore: 0, awayScore: 0 }];
    const { tx, updates } = makeTx(rows, games);

    await recomputeStoredStandings(tx as any, 's1', 'comp_liga_haal');
    // update payloads must not touch pointsAdjustment
    for (const u of updates) {
      expect(u.data).not.toHaveProperty('pointsAdjustment');
    }
  });

  it('does not recompute positions when playoff groups are present', async () => {
    const rows = [
      base({ teamId: 'A', position: 1, groupNameEn: 'Championship Group' }),
      base({ teamId: 'B', position: 2, groupNameEn: 'Relegation Group' }),
    ];
    const games = [{ homeTeamId: 'A', awayTeamId: 'B', homeScore: 5, awayScore: 0 }];
    const { tx, updates } = makeTx(rows, games);

    await recomputeStoredStandings(tx as any, 's1', 'comp_liga_haal');
    for (const u of updates) {
      expect(u.data).not.toHaveProperty('position'); // group ordering left intact
    }
  });

  it('is a no-op with no competition or no existing rows', async () => {
    const t1 = makeTx([], []);
    expect(await recomputeStoredStandings(t1.tx as any, 's1', null)).toBe(0);
    expect(t1.tx.standing.findMany).not.toHaveBeenCalled();

    const t2 = makeTx([], [{ homeTeamId: 'A', awayTeamId: 'B', homeScore: 1, awayScore: 1 }]);
    expect(await recomputeStoredStandings(t2.tx as any, 's1', 'comp_liga_haal')).toBe(0);
  });
});
