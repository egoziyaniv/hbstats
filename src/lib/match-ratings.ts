/**
 * Shared logic for user match ratings (web + mobile rate endpoints).
 *
 * Guards a rating submission: caps the batch size, only allows rating a game
 * that has actually been played, only accepts ratings for players who
 * participated in THAT game, and applies the whole batch in a single
 * transaction so a mid-batch failure never leaves a partial save.
 */
import prisma from '@/lib/prisma';

export const MAX_RATINGS = 60; // ~11 starters + subs per side; cap abuse

export interface RatingInput {
  playerId: string;
  rating: number | null;
}

// Flat result (not a discriminated union): the project builds with
// `strict:false`, under which TS doesn't reliably narrow a boolean-discriminant
// union. Callers branch on `error` being non-null.
export interface RateResult {
  status: number; // HTTP status the route should return
  saved: number;
  cleared: number;
  error: string | null;
}

const fail = (status: number, error: string): RateResult => ({ status, saved: 0, cleared: 0, error });

export async function submitMatchRatings(
  gameId: string,
  userId: string,
  ratings: unknown,
): Promise<RateResult> {
  if (!Array.isArray(ratings)) return fail(400, 'Bad request');
  if (ratings.length > MAX_RATINGS) return fail(400, 'Too many ratings');

  const game = await prisma.game.findUnique({ where: { id: gameId }, select: { id: true, status: true } });
  if (!game) return fail(404, 'Game not found');
  // Only games that have actually been played can be rated (not SCHEDULED/CANCELLED).
  if (game.status !== 'COMPLETED' && game.status !== 'ONGOING') {
    return fail(400, 'אפשר לנקד רק משחקים ששוחקו.');
  }

  // Players who actually took part in this game — lineup entries plus anyone
  // named in an event (scorer / assist / subbed-on). A rating for a player not
  // in this set is dropped (you can't rate someone who didn't play the match).
  const [lineup, events] = await Promise.all([
    prisma.gameLineupEntry.findMany({ where: { gameId, playerId: { not: null } }, select: { playerId: true } }),
    prisma.gameEvent.findMany({ where: { gameId }, select: { playerId: true, assistPlayerId: true, relatedPlayerId: true } }),
  ]);
  const participants = new Set<string>();
  for (const l of lineup) if (l.playerId) participants.add(l.playerId);
  for (const e of events) {
    if (e.playerId) participants.add(e.playerId);
    if (e.assistPlayerId) participants.add(e.assistPlayerId);
    if (e.relatedPlayerId) participants.add(e.relatedPlayerId);
  }

  // Normalize input → set/clear ops (dedupe by player, keep last).
  const toSet = new Map<string, number>();
  const toClear = new Set<string>();
  for (const r of ratings as RatingInput[]) {
    const playerId = String(r?.playerId || '').trim();
    if (!playerId) continue;
    const raw = r?.rating;
    if (raw == null || raw === 0) {
      toClear.add(playerId);
      toSet.delete(playerId);
      continue;
    }
    const value = Number(raw);
    // Reject out-of-range / non-numeric, and players who didn't play.
    if (!Number.isFinite(value) || value < 1 || value > 10) continue;
    if (!participants.has(playerId)) continue;
    toSet.set(playerId, value);
    toClear.delete(playerId);
  }

  const result = await prisma.$transaction(async (tx) => {
    let saved = 0;
    let cleared = 0;
    if (toClear.size) {
      const del = await tx.playerMatchRating.deleteMany({
        where: { gameId, source: 'user', sourceUserId: userId, playerId: { in: [...toClear] } },
      });
      cleared = del.count;
    }
    for (const [playerId, rating] of toSet) {
      const existing = await tx.playerMatchRating.findFirst({
        where: { gameId, playerId, source: 'user', sourceUserId: userId },
        select: { id: true },
      });
      if (existing) {
        await tx.playerMatchRating.update({ where: { id: existing.id }, data: { rating } });
      } else {
        await tx.playerMatchRating.create({
          data: { gameId, playerId, source: 'user', sourceUserId: userId, rating },
        });
      }
      saved++;
    }
    return { saved, cleared };
  });

  return { status: 200, saved: result.saved, cleared: result.cleared, error: null };
}
