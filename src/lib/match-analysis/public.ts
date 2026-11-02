// What the public pages read: published analyses only.
import prisma from '@/lib/prisma';

export interface PublicAnalysis {
  id: string;
  kind: 'POST' | 'PRE';
  gameId: string;
  titleHe: string | null;
  paragraphs: string[];
  publishedAt: string | null;
}

const select = { id: true, kind: true, gameId: true, titleHe: true, bodyHe: true, publishedAt: true } as const;

function toPublic(r: { id: string; kind: 'POST' | 'PRE'; gameId: string; titleHe: string | null; bodyHe: string | null; publishedAt: Date | null }): PublicAnalysis {
  return {
    id: r.id, kind: r.kind, gameId: r.gameId, titleHe: r.titleHe,
    paragraphs: (r.bodyHe || '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean),
    publishedAt: r.publishedAt?.toISOString() ?? null,
  };
}

export async function getPublishedAnalyses(gameId: string): Promise<{ post: PublicAnalysis | null; pre: PublicAnalysis | null }> {
  const rows = await prisma.matchAnalysis.findMany({ where: { gameId, status: 'PUBLISHED' }, select });
  const pick = (kind: 'POST' | 'PRE') => {
    const r = rows.find((x) => x.kind === kind);
    return r && r.bodyHe ? toPublic(r) : null;
  };
  return { post: pick('POST'), pre: pick('PRE') };
}

/** Home teaser: the preview of a game within the next 7 days, else the latest post-match piece. */
export async function getLatestPublishedAnalysis(): Promise<PublicAnalysis | null> {
  const now = new Date();
  const pre = await prisma.matchAnalysis.findFirst({
    where: { status: 'PUBLISHED', kind: 'PRE', bodyHe: { not: null }, game: { status: 'SCHEDULED', dateTime: { gte: now, lte: new Date(now.getTime() + 7 * 86_400_000) } } },
    orderBy: { publishedAt: 'desc' },
    select,
  });
  if (pre) return toPublic(pre);
  const post = await prisma.matchAnalysis.findFirst({
    where: { status: 'PUBLISHED', kind: 'POST', bodyHe: { not: null } },
    orderBy: { game: { dateTime: 'desc' } },
    select,
  });
  return post ? toPublic(post) : null;
}
