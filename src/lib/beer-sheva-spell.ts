// src/lib/beer-sheva-spell.ts — a player's spell at Hapoel Be'er Sheva.
//
// This is a Beer Sheva site, so career totals are the wrong unit: דור מלול has 425
// appearances but only 27 of them are ours. Everything here is scoped to games played
// FOR Beer Sheva, season by season, with the club honours won while he was here.
import prisma from '@/lib/prisma';
import type { BeerShevaSpell, BeerShevaSeasonLine } from '@shared/types/mobile-api';

export const BS_NAME_HE = 'הפועל באר שבע';
const BS_AF = 563;

let teamIdCache: { ids: string[]; at: number } | null = null;

/**
 * Every Team row that is Hapoel Be'er Sheva, 1965-2026.
 * Matching on apiFootballId alone misses 2001-2013 — those rows predate the API-Football
 * ids and carry apiFootballId=null — which is why the exact Hebrew name is matched too.
 * Deliberately exact: "מכבי באר שבע" and "בית\"ר באר שבע" are other clubs.
 */
export async function getBeerShevaTeamIds(): Promise<string[]> {
  if (teamIdCache && Date.now() - teamIdCache.at < 60_000) return teamIdCache.ids;
  const rows = await prisma.team.findMany({
    where: { OR: [{ apiFootballId: BS_AF }, { nameHe: BS_NAME_HE }] },
    select: { id: true },
  });
  const ids = rows.map((r) => r.id);
  teamIdCache = { ids, at: Date.now() };
  return ids;
}

/** 2016 -> "2016/17". Season.name is inconsistent in the data ("2012/2013" vs "2016/17"). */
export function seasonLabel(year: number): string {
  return `${year}/${String(year + 1).slice(2)}`;
}

function pluralSeasons(n: number): string {
  if (n === 1) return 'עונה אחת';
  if (n === 2) return 'שתי עונות';
  return `${n} עונות`;
}

/** "3 אליפויות, גביע מדינה וגביע טוטו" — grouped, counted, and joined properly. */
function honorsSentence(honors: Array<{ competitionHe: string }>): string {
  const NAMES: Record<string, [string, string]> = {
    'ליגת העל': ['אליפות', 'אליפויות'],
    'גביע המדינה': ['גביע מדינה', 'גביעי מדינה'],
    'גביע הטוטו': ['גביע טוטו', 'גביעי טוטו'],
    'אלוף האלופים': ['אליפות אלוף האלופים', 'אליפויות אלוף האלופים'],
    'גביע ליליאן': ['גביע ליליאן', 'גביעי ליליאן'],
  };
  const counts = new Map<string, number>();
  for (const h of honors) counts.set(h.competitionHe, (counts.get(h.competitionHe) ?? 0) + 1);

  const parts = [...counts.entries()].map(([comp, n]) => {
    const [one, many] = NAMES[comp] ?? [comp, comp];
    return n === 1 ? one : `${n} ${many}`;
  });
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(', ')} ו${parts[parts.length - 1]}`;
}

export async function buildBeerShevaSpell(playerId: string): Promise<BeerShevaSpell | null> {
  const [player, family, bsTeamIds] = await Promise.all([
    prisma.player.findUnique({ where: { id: playerId }, select: { nameHe: true } }),
    prisma.player.findMany({
      where: { OR: [{ id: playerId }, { canonicalPlayerId: playerId }] },
      select: {
        id: true,
        teamId: true,
        team: { select: { id: true, seasonId: true, season: { select: { id: true, year: true } } } },
      },
    }),
    getBeerShevaTeamIds(),
  ]);
  if (!player) return null;

  // Only the season rows that belong to a Beer Sheva squad. Each Player row belongs to
  // exactly one team, so its events and lineups are unambiguously Beer Sheva's.
  const bsSet = new Set(bsTeamIds);
  const bsRows = family.filter((f) => f.teamId && bsSet.has(f.teamId) && f.team);
  if (bsRows.length === 0) return null;

  const rowIds = bsRows.map((r) => r.id);
  const [starters, events] = await Promise.all([
    prisma.gameLineupEntry.groupBy({
      by: ['playerId'],
      where: { playerId: { in: rowIds }, role: 'STARTER' },
      _count: true,
    }),
    prisma.gameEvent.groupBy({
      by: ['playerId', 'type'],
      where: {
        playerId: { in: rowIds },
        type: { in: ['GOAL', 'PENALTY_GOAL', 'ASSIST', 'YELLOW_CARD', 'RED_CARD', 'SUBSTITUTION_IN'] },
      },
      _count: true,
    }),
  ]);

  const startsBy = new Map(starters.map((s) => [s.playerId as string, s._count]));
  const eventBy = new Map<string, Map<string, number>>();
  for (const e of events) {
    const m = eventBy.get(e.playerId as string) ?? new Map<string, number>();
    m.set(e.type, e._count);
    eventBy.set(e.playerId as string, m);
  }
  const ev = (rowId: string, type: string) => eventBy.get(rowId)?.get(type) ?? 0;

  // One line per season. A player can have two rows in the same season year (a mid-season
  // return), so fold by year rather than by row.
  const byYear = new Map<number, BeerShevaSeasonLine>();
  for (const r of bsRows) {
    const season = r.team!.season;
    const line = byYear.get(season.year) ?? {
      seasonId: season.id,
      year: season.year,
      label: seasonLabel(season.year),
      teamId: r.team!.id,
      appearances: 0,
      goals: 0,
      assists: 0,
      honors: [],
    };
    // An appearance is a start or a substitution actually played — being named on the
    // bench (role SUBSTITUTE) is not an appearance.
    line.appearances += (startsBy.get(r.id) ?? 0) + ev(r.id, 'SUBSTITUTION_IN');
    line.goals += ev(r.id, 'GOAL') + ev(r.id, 'PENALTY_GOAL');
    line.assists += ev(r.id, 'ASSIST');
    byYear.set(season.year, line);
  }

  const years = [...byYear.keys()].sort((a, b) => a - b);
  const firstYear = years[0];
  const lastYear = years[years.length - 1];

  const honorRows = await prisma.clubHonor.findMany({
    where: { place: 'WINNER', year: { in: years } },
    orderBy: { year: 'asc' },
  });
  for (const h of honorRows) byYear.get(h.year)?.honors.push(h.competitionHe);

  const seasons = [...byYear.values()].sort((a, b) => b.year - a.year);
  const totals = seasons.reduce(
    (acc, s) => ({
      appearances: acc.appearances + s.appearances,
      goals: acc.goals + s.goals,
      assists: acc.assists + s.assists,
    }),
    { appearances: 0, goals: 0, assists: 0 },
  );
  const yellowCards = rowIds.reduce((n, id) => n + ev(id, 'YELLOW_CARD'), 0);
  const redCards = rowIds.reduce((n, id) => n + ev(id, 'RED_CARD'), 0);

  // A few plain sentences, generated from the numbers above — never invented.
  const span =
    firstYear === lastYear
      ? `בעונת ${seasonLabel(firstYear)}`
      : `בין ${seasonLabel(firstYear)} ל-${seasonLabel(lastYear)}`;
  const contribution = [
    totals.appearances ? `${totals.appearances} הופעות` : null,
    totals.goals ? `${totals.goals} שערים` : null,
    totals.assists ? `${totals.assists} בישולים` : null,
  ].filter(Boolean) as string[];

  const lines: string[] = [];
  lines.push(
    `${player.nameHe} לבש את מדי הפועל באר שבע ${span}, ${pluralSeasons(seasons.length)} בסך הכול` +
      (contribution.length ? `, ורשם ${contribution.join(', ')}.` : '.'),
  );
  if (honorRows.length) {
    lines.push(`בתקופתו זכתה הקבוצה ב${honorsSentence(honorRows)}.`);
  }
  const best = [...seasons].sort((a, b) => b.appearances - a.appearances)[0];
  if (seasons.length > 1 && best.appearances > 0) {
    lines.push(
      `עונתו הבולטת ביותר במדי הקבוצה הייתה ${best.label} עם ${best.appearances} הופעות` +
        (best.goals ? ` ו-${best.goals} שערים.` : '.'),
    );
  }

  return {
    seasons,
    firstYear,
    lastYear,
    firstLabel: seasonLabel(firstYear),
    lastLabel: seasonLabel(lastYear),
    appearances: totals.appearances,
    goals: totals.goals,
    assists: totals.assists,
    yellowCards,
    redCards,
    honors: honorRows.map((h) => ({
      competitionHe: h.competitionHe,
      seasonLabel: h.seasonLabel,
      year: h.year,
    })),
    summaryHe: lines.join(' '),
  };
}
