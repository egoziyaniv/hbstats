import { prisma } from '@/lib/prisma';
import type { StatAnswer, ResolveCtx } from './types';

type LinkKind = 'game' | 'player' | 'none';

function linkFor(kind: LinkKind, row: { gameId?: string | null; playerId?: string | null }): string | undefined {
  if (kind === 'game' && row.gameId) return `/games/${row.gameId}`;
  if (kind === 'player' && row.playerId) return `/players/${row.playerId}`;
  return undefined;
}

/** Reads a materialized RecordEntry (rank 1) for the given category/scope. */
export function recordResolver(category: string, _cardType: 'hero', link: LinkKind) {
  return async (ctx: ResolveCtx): Promise<StatAnswer> => {
    const scope = ctx.clubKey ? `club:${ctx.clubKey}` : 'league';
    const rows = await prisma.recordEntry.findMany({
      where: { category, scope },
      orderBy: { rank: 'asc' },
      take: 1,
    });
    const row = rows[0];
    if (!row) return { headline: null };
    return {
      headline: { label: row.labelHe, value: row.detailHe ?? String(row.valueNum ?? '') },
      href: linkFor(link, row),
    };
  };
}

/** Leaderboard variant: top-N RecordEntry rows (e.g. league most_goals_player_game). */
export function recordLeaderboardResolver(category: string, link: LinkKind, take = 5) {
  return async (ctx: ResolveCtx): Promise<StatAnswer> => {
    const scope = ctx.clubKey ? `club:${ctx.clubKey}` : 'league';
    const rows = await prisma.recordEntry.findMany({ where: { category, scope }, orderBy: { rank: 'asc' }, take });
    if (!rows.length) return { headline: null };
    return {
      headline: { label: rows[0].labelHe, value: rows[0].detailHe ?? String(rows[0].valueNum ?? '') },
      top: rows.map((r) => ({ name: r.labelHe, value: r.detailHe ?? String(r.valueNum ?? ''), href: linkFor(link, r) })),
    };
  };
}
