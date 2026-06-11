import { applyStatDelta, statFieldForEventType } from '@/lib/event-stat-delta';

function fakeTx({
  game = { seasonId: 'season-1', competitionId: 'comp-1' } as { seasonId: string; competitionId: string | null } | null,
  scopedCount = 1,
} = {}) {
  return {
    game: { findUnique: jest.fn().mockResolvedValue(game) },
    playerStatistics: { updateMany: jest.fn().mockResolvedValue({ count: scopedCount }) },
  };
}

describe('statFieldForEventType', () => {
  it('maps stat-affecting event types to their counter field', () => {
    expect(statFieldForEventType('GOAL')).toBe('goals');
    expect(statFieldForEventType('ASSIST')).toBe('assists');
    expect(statFieldForEventType('YELLOW_CARD')).toBe('yellowCards');
    expect(statFieldForEventType('RED_CARD')).toBe('redCards');
  });

  it('returns null for non-stat event types', () => {
    expect(statFieldForEventType('SUBSTITUTION_IN')).toBeNull();
    expect(statFieldForEventType('SUBSTITUTION_OUT')).toBeNull();
    expect(statFieldForEventType('PENALTY_MISSED')).toBeNull();
  });
});

describe('applyStatDelta', () => {
  it('uses increment (not assignment) and scopes to the game season+competition', async () => {
    const tx = fakeTx();
    await applyStatDelta(tx as any, { playerId: 'p1', gameId: 'g1', type: 'GOAL', direction: 1 });

    expect(tx.playerStatistics.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.playerStatistics.updateMany).toHaveBeenCalledWith({
      where: { playerId: 'p1', seasonId: 'season-1', competitionId: 'comp-1' },
      data: { goals: { increment: 1 } },
    });
  });

  it('falls back to the season-level (null competition) row when no scoped row matches', async () => {
    const tx = fakeTx({ scopedCount: 0 });
    await applyStatDelta(tx as any, { playerId: 'p1', gameId: 'g1', type: 'ASSIST', direction: 1 });

    expect(tx.playerStatistics.updateMany).toHaveBeenCalledTimes(2);
    expect(tx.playerStatistics.updateMany).toHaveBeenLastCalledWith({
      where: { playerId: 'p1', seasonId: 'season-1', competitionId: null },
      data: { assists: { increment: 1 } },
    });
  });

  it('does not run the fallback twice when the game itself has no competition', async () => {
    const tx = fakeTx({ game: { seasonId: 'season-1', competitionId: null }, scopedCount: 0 });
    await applyStatDelta(tx as any, { playerId: 'p1', gameId: 'g1', type: 'GOAL', direction: 1 });

    expect(tx.playerStatistics.updateMany).toHaveBeenCalledTimes(1);
  });

  it('clamps counters at zero after a decrement', async () => {
    const tx = fakeTx();
    await applyStatDelta(tx as any, { playerId: 'p1', gameId: 'g1', type: 'RED_CARD', direction: -1 });

    const calls = tx.playerStatistics.updateMany.mock.calls;
    expect(calls[0][0].data).toEqual({ redCards: { increment: -1 } });
    expect(calls[calls.length - 1][0]).toEqual({
      where: { playerId: 'p1', seasonId: 'season-1', redCards: { lt: 0 } },
      data: { redCards: 0 },
    });
  });

  it('is a no-op without playerId, without gameId, for non-stat types, or when the game is missing', async () => {
    const tx1 = fakeTx();
    await applyStatDelta(tx1 as any, { playerId: null, gameId: 'g1', type: 'GOAL', direction: 1 });
    expect(tx1.playerStatistics.updateMany).not.toHaveBeenCalled();

    const tx2 = fakeTx();
    await applyStatDelta(tx2 as any, { playerId: 'p1', gameId: null, type: 'GOAL', direction: 1 });
    expect(tx2.playerStatistics.updateMany).not.toHaveBeenCalled();

    const tx3 = fakeTx();
    await applyStatDelta(tx3 as any, { playerId: 'p1', gameId: 'g1', type: 'SUBSTITUTION_IN', direction: 1 });
    expect(tx3.playerStatistics.updateMany).not.toHaveBeenCalled();

    const tx4 = fakeTx({ game: null });
    await applyStatDelta(tx4 as any, { playerId: 'p1', gameId: 'g1', type: 'GOAL', direction: 1 });
    expect(tx4.playerStatistics.updateMany).not.toHaveBeenCalled();
  });
});
