import { prisma } from '@/lib/prisma';
import type { StatAnswer, ResolveCtx } from './types';
import { clubAllTimeTopScorers, leagueAllTimeTopScorers, clubTopOpponents, topRivalries } from './aggregations';
import { getClubHonors, getAllHonors } from '@/lib/history/club-honors';
import { getSeasonsSpine } from '@/lib/history/seasons-spine';
import { buildAllTimeTable } from '@/lib/history/all-time-table';
import { buildFullH2H } from '@/lib/h2h';
import { getClubFamily } from '@/lib/history/club-identity';

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

// ---------------------------------------------------------------------------
// Service-backed resolvers — read from the history/aggregations services
// rather than prisma.recordEntry directly. H2H hrefs use `__` as the pair
// separator, matching the real route at src/app/history/h2h/[keys]/page.tsx
// (resolvePair splits on `raw.split('__')`), NOT `--`.
// ---------------------------------------------------------------------------

const scorerCard = (rows: { playerId: string | null; nameHe: string; goals: number }[]): StatAnswer => {
  if (!rows.length) return { headline: null };
  const top = rows[0];
  return {
    headline: { label: top.nameHe, value: String(top.goals), unit: 'שערים' },
    top: rows.map((s) => ({ name: s.nameHe, value: String(s.goals), href: s.playerId ? `/players/${s.playerId}` : undefined })),
    href: top.playerId ? `/players/${top.playerId}` : undefined,
    coverageNote: 'מבוסס לוחות מובילים עונתיים',
  };
};

export const clubTopScorerResolver = async (ctx: ResolveCtx): Promise<StatAnswer> =>
  scorerCard(await clubAllTimeTopScorers(ctx.clubKey!, 6));

export const leagueTopScorerResolver = async (): Promise<StatAnswer> =>
  scorerCard(await leagueAllTimeTopScorers(6));

export const clubTopOpponentResolver = async (ctx: ResolveCtx): Promise<StatAnswer> => {
  const rows = await clubTopOpponents(ctx.clubKey!, 6);
  if (!rows.length) return { headline: null };
  const t = rows[0];
  return {
    headline: { label: t.nameHe, value: `${t.games}`, unit: 'משחקים' },
    secondary: `מאזן: ${t.wins} נצחונות · ${t.draws} תיקו · ${t.losses} הפסדים`,
    top: rows.map((o) => ({ name: o.nameHe, value: `${o.games} (${o.wins}-${o.draws}-${o.losses})`, href: `/history/h2h/${ctx.clubKey}__${o.clubKey}` })),
  };
};

export const clubHonorsResolver = async (ctx: ResolveCtx): Promise<StatAnswer> => {
  const h = await getClubHonors(ctx.clubKey!);
  if (!h) return { headline: null };
  const total = h.leagueTitles.count + h.stateCup.count + h.totoCup.count + h.superCup.count;
  return {
    headline: { label: 'סה"כ תארים', value: String(total) },
    top: [
      { name: 'אליפויות', value: String(h.leagueTitles.count) },
      { name: 'גביע המדינה', value: String(h.stateCup.count) },
      { name: 'גביע הטוטו', value: String(h.totoCup.count) },
      { name: 'סופרקאפ', value: String(h.superCup.count) },
    ],
  };
};

export const mostTitlesResolver = async (): Promise<StatAnswer> => {
  const all = (await getAllHonors()).slice().sort((a, b) => b.leagueTitles.count - a.leagueTitles.count).slice(0, 6);
  if (!all.length) return { headline: null };
  return {
    headline: { label: all[0].nameHe, value: String(all[0].leagueTitles.count), unit: 'אליפויות' },
    top: all.map((h) => ({ name: h.nameHe, value: String(h.leagueTitles.count) })),
  };
};

export const mostStateCupsResolver = async (): Promise<StatAnswer> => {
  const all = (await getAllHonors()).slice().sort((a, b) => b.stateCup.count - a.stateCup.count).slice(0, 6);
  if (!all.length) return { headline: null };
  return {
    headline: { label: all[0].nameHe, value: String(all[0].stateCup.count), unit: 'גביעי מדינה' },
    top: all.map((h) => ({ name: h.nameHe, value: String(h.stateCup.count) })),
  };
};

export const clubBestSeasonResolver = async (ctx: ResolveCtx): Promise<StatAnswer> => {
  const fam = await getClubFamily(ctx.clubKey!);
  if (!fam) return { headline: null };
  const spine = await getSeasonsSpine();
  const champ = spine.find((s) => s.champion && fam.teamIds.includes(s.champion.teamId));
  if (champ) return { headline: { label: 'אלופה', value: champ.name }, secondary: 'העונה הטובה ביותר: זכייה באליפות' };
  const runner = spine.find((s) => s.runnerUp && fam.teamIds.includes(s.runnerUp.teamId));
  if (runner) return { headline: { label: 'סגנית אלופה', value: runner.name } };
  return { headline: null };
};

export const allTimeLeaderResolver = async (): Promise<StatAnswer> => {
  const rows = await buildAllTimeTable({ scope: 'all' });
  if (!rows.length) return { headline: null };
  return {
    headline: { label: rows[0].nameHe, value: String(rows[0].points), unit: 'נק׳' },
    top: rows.slice(0, 6).map((r) => ({ name: r.nameHe, value: `${r.points}` })),
    href: '/history/all-time',
  };
};

export const biggestRivalriesResolver = async (): Promise<StatAnswer> => {
  const rows = await topRivalries(6);
  if (!rows.length) return { headline: null };
  return {
    headline: { label: rows[0].label, value: String(rows[0].games), unit: 'מפגשים' },
    top: rows.map((r) => ({ name: r.label, value: String(r.games), href: `/history/h2h/${r.aKey}__${r.bKey}` })),
    href: '/history/h2h',
  };
};

export const h2hRivalResolver = async (ctx: ResolveCtx): Promise<StatAnswer> => {
  if (!ctx.clubKey || !ctx.rivalKey) return { headline: null };
  const a = await getClubFamily(ctx.clubKey); const b = await getClubFamily(ctx.rivalKey);
  if (!a || !b) return { headline: null };
  const h = await buildFullH2H(a.latestTeamId, b.latestTeamId);
  if (!h || h.totals.games === 0) return { headline: null };
  return {
    headline: { label: `${h.teamAName} מול ${h.teamBName}`, value: `${h.totals.winsA}-${h.totals.draws}-${h.totals.winsB}` },
    secondary: `${h.totals.games} מפגשים · שערים ${h.totals.goalsA}:${h.totals.goalsB}`,
    href: `/history/h2h/${ctx.clubKey}__${ctx.rivalKey}`,
  };
};
