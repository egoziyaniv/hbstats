// The admin editor's view of the analyses tied to one finished game: its POST piece and the PRE
// piece of the game after it (both carry sourceGameId = the finished game).
import prisma from '@/lib/prisma';
import { unknownNumbers } from './check';
import type { Fact } from './types';

export interface AdminAnalysis {
  id: string;
  kind: 'POST' | 'PRE';
  gameId: string;
  headline: string;
  status: 'DRAFT' | 'PUBLISHED';
  titleHe: string;
  bodyHe: string;
  facts: Fact[];
  aiGenerated: boolean;
  scoreChanged: boolean;
  unknownNumbers: string[];
  updatedAt: string;
}

export async function getAdminAnalyses(gameId: string): Promise<AdminAnalysis[]> {
  const rows = await prisma.matchAnalysis.findMany({
    where: { OR: [{ sourceGameId: gameId }, { gameId }] },
    orderBy: { kind: 'desc' }, // POST before PRE
    include: {
      game: {
        select: {
          homeScore: true, awayScore: true, dateTime: true,
          homeTeam: { select: { nameHe: true, nameEn: true } },
          awayTeam: { select: { nameHe: true, nameEn: true } },
        },
      },
    },
  });
  return rows.map((r) => {
    const facts = (r.facts as unknown as Fact[]) || [];
    const home = r.game.homeTeam.nameHe || r.game.homeTeam.nameEn;
    const away = r.game.awayTeam.nameHe || r.game.awayTeam.nameEn;
    const score = `${r.game.homeScore}-${r.game.awayScore}`;
    return {
      id: r.id, kind: r.kind, gameId: r.gameId, status: r.status,
      headline: r.kind === 'POST' ? `${home} ${score} ${away}` : `${home} נגד ${away}`,
      titleHe: r.titleHe || '', bodyHe: r.bodyHe || '', facts, aiGenerated: r.aiGenerated,
      scoreChanged: r.kind === 'POST' && r.scoreAtBuild != null && r.scoreAtBuild !== score,
      unknownNumbers: unknownNumbers(r.bodyHe || '', facts, [score]),
      updatedAt: r.updatedAt.toISOString(),
    };
  });
}

export async function countPendingAnalyses(): Promise<number> {
  return prisma.matchAnalysis.count({ where: { status: 'DRAFT' } });
}
