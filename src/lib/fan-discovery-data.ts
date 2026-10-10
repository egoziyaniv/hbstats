import prisma from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { evidence, weeklyPick } from './fan-discovery';

export const clubOfficialWhere: Prisma.GameWhereInput = {
  OR: [{ homeTeam: { apiFootballId: 563 } }, { awayTeam: { apiFootballId: 563 } }],
  competition: { type: { in: ['LEAGUE', 'CUP', 'EUROPE'] }, AND: [
    { OR: [{ apiFootballId: null }, { apiFootballId: { not: 667 } }] },
    { NOT: { nameEn: { contains: 'friendly', mode: 'insensitive' } } },
    { NOT: { nameEn: { contains: 'friendlies', mode: 'insensitive' } } },
    { NOT: { nameHe: { contains: 'ידידות' } } },
  ] },
};
export const discoverySelect = {
  id: true, dateTime: true, status: true, statusShort: true, statusLong: true, homeScore: true, awayScore: true, roundNameHe: true, roundNameEn: true,
  homeTeam: { select: { apiFootballId: true, nameHe: true, nameEn: true } },
  awayTeam: { select: { apiFootballId: true, nameHe: true, nameEn: true } },
  season: { select: { name: true } }, competition: { select: { nameHe: true, nameEn: true } },
} satisfies Prisma.GameSelect;
export async function weeklyQuiz(now = new Date()) {
  // The fixed historical cutoff prevents the week's new results from changing the question.
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const games = await prisma.game.findMany({ where: { AND: [clubOfficialWhere, { status: 'COMPLETED', dateTime: { lt: yearStart }, homeScore: { gte: 0 }, awayScore: { gte: 0 } }] }, select: discoverySelect, orderBy: { id: 'asc' } });
  const chosen = weeklyPick(games.filter(game => evidence(game)), now);
  return chosen ? evidence(chosen) : null;
}
