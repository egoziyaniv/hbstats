// src/lib/player-contribution.ts — a player's real contribution in our data,
// aggregated across the whole canonical family (season-specific Player rows hang
// off the canonical id, and GameEvent/GameLineupEntry point at those rows — so
// counting the canonical id alone would only ever return one season).
// Shared by the hall-of-fame legend pages and the fan-chant song pages.
import prisma from '@/lib/prisma';
import { formatPlayerPosition } from '@/lib/player-display';
import type { PlayerContribution } from '@shared/types/mobile-api';

export async function buildPlayerContribution(playerId: string): Promise<PlayerContribution | null> {
  const family = await prisma.player.findMany({
    where: { OR: [{ id: playerId }, { canonicalPlayerId: playerId }] },
    select: { id: true },
  });
  const famIds = [...new Set([playerId, ...family.map((f) => f.id)])];

  const [player, goals, appearances] = await Promise.all([
    prisma.player.findUnique({ where: { id: playerId }, select: { photoUrl: true, position: true } }),
    prisma.gameEvent.count({ where: { playerId: { in: famIds }, type: { in: ['GOAL', 'PENALTY_GOAL'] } } }),
    prisma.gameLineupEntry.count({ where: { playerId: { in: famIds }, role: 'STARTER' } }),
  ]);
  if (!player) return null;

  return {
    photoUrl: player.photoUrl,
    // Hebrew here, not at each call site — the raw value is English ("Defender")
    // and every consumer of this is a Hebrew UI. Null stays null so it can hide.
    position: player.position ? formatPlayerPosition(player.position) : null,
    goals,
    appearances,
  };
}
