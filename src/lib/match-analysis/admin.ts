// Admin views of match analyses: the approval queue, and the editor for one finished game — its POST
// piece and the PRE piece of the game after it (both carry sourceGameId = the finished game).
import type { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { unknownNumbers } from './check';
import type { Fact } from './types';

export interface AdminAnalysis {
  id: string;
  kind: 'POST' | 'PRE';
  gameId: string;
  editorGameId: string; // the finished game whose editor page holds this piece
  gameDate: string;
  headline: string;
  status: 'DRAFT' | 'PUBLISHED';
  titleHe: string;
  bodyHe: string;
  facts: Fact[];
  aiGenerated: boolean;
  scoreChanged: boolean;
  unknownNumbers: string[];
  updatedAt: string;
  publishedAt: string | null;
}

const include = {
  game: {
    select: {
      homeScore: true, awayScore: true, dateTime: true,
      homeTeam: { select: { nameHe: true, nameEn: true } },
      awayTeam: { select: { nameHe: true, nameEn: true } },
    },
  },
} as const;

type Row = Prisma.MatchAnalysisGetPayload<{ include: typeof include }>;

function toAdmin(r: Row): AdminAnalysis {
  const facts = (r.facts as unknown as Fact[]) || [];
  const home = r.game.homeTeam.nameHe || r.game.homeTeam.nameEn;
  const away = r.game.awayTeam.nameHe || r.game.awayTeam.nameEn;
  const score = `${r.game.homeScore}-${r.game.awayScore}`;
  return {
    id: r.id, kind: r.kind, gameId: r.gameId, status: r.status,
    editorGameId: r.sourceGameId ?? r.gameId,
    gameDate: r.game.dateTime.toISOString(),
    headline: r.kind === 'POST' ? `${home} ${score} ${away}` : `${home} נגד ${away}`,
    titleHe: r.titleHe || '', bodyHe: r.bodyHe || '', facts, aiGenerated: r.aiGenerated,
    scoreChanged: r.kind === 'POST' && r.scoreAtBuild != null && r.scoreAtBuild !== score,
    unknownNumbers: unknownNumbers(r.bodyHe || '', facts, [score]),
    updatedAt: r.updatedAt.toISOString(),
    publishedAt: r.publishedAt?.toISOString() ?? null,
  };
}

export async function getAdminAnalyses(gameId: string): Promise<AdminAnalysis[]> {
  const rows = await prisma.matchAnalysis.findMany({
    where: { OR: [{ sourceGameId: gameId }, { gameId }] },
    orderBy: { kind: 'desc' }, // POST before PRE
    include,
  });
  return rows.map(toAdmin);
}

/** The approval queue (oldest draft first) or the published list (newest first). */
export async function listAdminAnalyses(status: 'DRAFT' | 'PUBLISHED', take = 50): Promise<AdminAnalysis[]> {
  const rows = await prisma.matchAnalysis.findMany({
    where: { status },
    orderBy: status === 'DRAFT' ? [{ createdAt: 'asc' }, { kind: 'desc' }] : [{ publishedAt: 'desc' }],
    include,
    take,
  });
  return rows.map(toAdmin);
}

export async function countAnalysesByStatus(): Promise<Record<'DRAFT' | 'PUBLISHED', number>> {
  const rows = await prisma.matchAnalysis.groupBy({ by: ['status'], _count: { _all: true } });
  const get = (s: 'DRAFT' | 'PUBLISHED') => rows.find((r) => r.status === s)?._count._all ?? 0;
  return { DRAFT: get('DRAFT'), PUBLISHED: get('PUBLISHED') };
}
