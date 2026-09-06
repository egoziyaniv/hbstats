// src/lib/player-contribution.ts — the compact "what he did here" summary shown on the
// hall-of-fame legend pages and the fan-chant song pages.
//
// The numbers are Beer Sheva's, not the player's career: this is a Beer Sheva site, and
// דור מלול's 425 career appearances — 27 of them ours — would be actively misleading
// beside a Beer Sheva chant. buildBeerShevaSpell does that scoping, across the whole
// canonical family (season Player rows hang off the canonical id, and events/lineups
// point at those rows, so counting the canonical id alone returns a single season).
import prisma from '@/lib/prisma';
import { formatPlayerPosition } from '@/lib/player-display';
import { buildBeerShevaSpell } from '@/lib/beer-sheva-spell';
import type { PlayerContribution } from '@shared/types/mobile-api';

export async function buildPlayerContribution(playerId: string): Promise<PlayerContribution | null> {
  const [player, spell] = await Promise.all([
    prisma.player.findUnique({
      where: { id: playerId },
      select: { photoUrl: true, position: true, photoCredit: true, photoSourceUrl: true },
    }),
    buildBeerShevaSpell(playerId),
  ]);
  if (!player) return null;

  return {
    photoUrl: player.photoUrl,
    photoCredit: player.photoCredit,
    photoSourceUrl: player.photoSourceUrl,
    // Hebrew here, not at each call site — the raw value is English ("Defender")
    // and every consumer of this is a Hebrew UI. Null stays null so it can hide.
    position: player.position ? formatPlayerPosition(player.position) : null,
    goals: spell?.goals ?? 0,
    appearances: spell?.appearances ?? 0,
    assists: spell?.assists ?? 0,
    firstLabel: spell?.firstLabel ?? null,
    lastLabel: spell?.lastLabel ?? null,
    seasonCount: spell?.seasons.length ?? 0,
  };
}
