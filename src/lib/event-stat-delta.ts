/**
 * Keeps PlayerStatistics counters in sync when an admin creates/updates/deletes
 * a game event via /api/events.
 *
 * History: the original in-route implementation passed a literal delta
 * ({ goals: 1 }) to updateMany — Prisma SET the value instead of incrementing —
 * and matched on { playerId } alone, hitting every season's stats row for the
 * player. See scripts/audit-player-stats-corruption.js for the damage audit.
 */

export type StatField = 'goals' | 'assists' | 'yellowCards' | 'redCards';

// Intentionally mirrors the original mapping: only these four event types touch
// PlayerStatistics. PENALTY_GOAL/OWN_GOAL are excluded — events created before
// this module never incremented them, so counting them on delete would corrupt.
const FIELD_BY_TYPE: Record<string, StatField> = {
  GOAL: 'goals',
  ASSIST: 'assists',
  YELLOW_CARD: 'yellowCards',
  RED_CARD: 'redCards',
};

export function statFieldForEventType(type: string | null | undefined): StatField | null {
  if (!type) return null;
  return FIELD_BY_TYPE[type] ?? null;
}

type TxLike = {
  game: { findUnique: (args: any) => Promise<{ seasonId: string; competitionId: string | null } | null> };
  playerStatistics: { updateMany: (args: any) => Promise<{ count: number }> };
};

export async function applyStatDelta(
  tx: TxLike,
  args: {
    playerId: string | null | undefined;
    gameId: string | null | undefined;
    type: string | null | undefined;
    direction: 1 | -1;
  }
) {
  const { playerId, gameId, type, direction } = args;
  if (!playerId || !gameId) return;
  const field = statFieldForEventType(type);
  if (!field) return;

  const game = await tx.game.findUnique({
    where: { id: gameId },
    select: { seasonId: true, competitionId: true },
  });
  if (!game) return;

  // Prefer the stats row matching the game's competition; fall back to the
  // season-level row (competitionId null, created by scraped-data merges).
  const scoped = await tx.playerStatistics.updateMany({
    where: { playerId, seasonId: game.seasonId, competitionId: game.competitionId },
    data: { [field]: { increment: direction } },
  });
  if (scoped.count === 0 && game.competitionId !== null) {
    await tx.playerStatistics.updateMany({
      where: { playerId, seasonId: game.seasonId, competitionId: null },
      data: { [field]: { increment: direction } },
    });
  }

  // Never let a decrement drive a counter below zero (e.g. deleting an event
  // that never incremented, such as one imported from IFA/API).
  if (direction < 0) {
    await tx.playerStatistics.updateMany({
      where: { playerId, seasonId: game.seasonId, [field]: { lt: 0 } },
      data: { [field]: 0 },
    });
  }
}
