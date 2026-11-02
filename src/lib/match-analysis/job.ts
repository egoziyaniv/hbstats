// After a Beer Sheva game: draft the POST analysis of it and the PRE analysis of the next game,
// store both as DRAFT and tell the admins. Idempotent — an existing draft is only rebuilt on `force`.
import type { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { sendIfAny } from '@/lib/push-notify';
import { runDetectors } from './detectors';
import { loadAnalysisContext, type AnalysisContext } from './history';
import { rankFacts } from './rank';
import type { AnalysisKind, ClubGame, Fact } from './types';
import { played } from './util';
import { writeAnalysis } from './write';

export interface DraftPiece {
  kind: AnalysisKind;
  gameId: string;
  headline: string;
  facts: Fact[]; // ranked facts first, the rest marked removed
  titleHe: string | null;
  bodyHe: string | null;
  status?: 'created' | 'rebuilt' | 'kept';
}

function headlineOf(ctx: AnalysisContext, g: ClubGame): string {
  const [home, away] = g.atHome ? [ctx.clubHe, g.opponentHe] : [g.opponentHe, ctx.clubHe];
  if (!played(g)) return `${home} נגד ${away}`;
  const [hs, as] = g.atHome ? [g.gf, g.ga] : [g.ga, g.gf];
  return `${home} ${hs}-${as} ${away}`;
}

async function draft(ctx: AnalysisContext, kind: AnalysisKind, target: ClubGame): Promise<DraftPiece> {
  const history = ctx.games.filter((g) => played(g) && g.date < target.date);
  const facts = runDetectors({ kind, target, history, league: ctx.league, leagueFrom: ctx.leagueFrom, clubHe: ctx.clubHe });
  const ranked = rankFacts(facts);
  const rest = facts.filter((f) => !ranked.includes(f)).map((f) => ({ ...f, removed: true }));
  const headline = headlineOf(ctx, target);
  const text = await writeAnalysis(kind, headline, ranked);
  return { kind, gameId: target.id, headline, facts: [...ranked, ...rest], titleHe: text?.titleHe ?? null, bodyHe: text?.bodyHe ?? null };
}

/** The next official game after `after`, if one is scheduled. */
function nextGame(ctx: AnalysisContext, after: ClubGame): ClubGame | null {
  return ctx.games.find((g) => !played(g) && g.date > after.date) ?? null;
}

async function notifyAdmins(body: string, gameId: string) {
  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN', isActive: true, pushTokens: { some: { enabled: true } } },
    select: { pushTokens: { where: { enabled: true }, select: { token: true } } },
  });
  await sendIfAny(admins.flatMap((u) => u.pushTokens.map((t) => t.token)), {
    title: 'ניתוח מוכן לאישור', body, data: { type: 'matchAnalysis', gameId },
  });
}

export async function buildAnalyses(
  gameId: string,
  { force = false, dry = false, ctx: given }: { force?: boolean; dry?: boolean; ctx?: AnalysisContext } = {},
): Promise<DraftPiece[]> {
  const ctx = given ?? (await loadAnalysisContext());
  const target = ctx.games.find((g) => g.id === gameId);
  if (!target || !played(target)) throw new Error(`game ${gameId} is not a completed official club game`);
  const next = nextGame(ctx, target);
  const plan: Array<[AnalysisKind, ClubGame]> = [['POST', target]];
  if (next) plan.push(['PRE', next]);

  const pieces: DraftPiece[] = [];
  for (const [kind, game] of plan) {
    const existing = dry ? null : await prisma.matchAnalysis.findUnique({ where: { gameId_kind: { gameId: game.id, kind } }, select: { id: true } });
    if (existing && !force) {
      pieces.push({ kind, gameId: game.id, headline: headlineOf(ctx, game), facts: [], titleHe: null, bodyHe: null, status: 'kept' });
      continue;
    }
    const piece = await draft(ctx, kind, game);
    if (!dry) {
      const data = {
        facts: piece.facts as unknown as Prisma.InputJsonValue,
        titleHe: piece.titleHe, bodyHe: piece.bodyHe, aiGenerated: piece.bodyHe != null,
        scoreAtBuild: kind === 'POST' ? `${target.gf}-${target.ga}` : null,
        sourceGameId: target.id, status: 'DRAFT' as const, publishedAt: null,
      };
      await prisma.matchAnalysis.upsert({
        where: { gameId_kind: { gameId: game.id, kind } },
        create: { gameId: game.id, kind, ...data },
        update: data,
      });
    }
    pieces.push({ ...piece, status: existing ? 'rebuilt' : 'created' });
  }

  const created = pieces.filter((p) => p.status === 'created');
  if (!dry && !force && created.length) {
    await notifyAdmins(created.map((p) => (p.kind === 'POST' ? `אחרי: ${p.headline}` : `לקראת: ${p.headline}`)).join(' · '), target.id).catch(() => undefined);
  }
  return pieces;
}

/** New wording from the facts the editor kept; numbers stay as computed. */
export async function rewriteAnalysis(id: string) {
  const row = await prisma.matchAnalysis.findUniqueOrThrow({ where: { id } });
  const facts = (row.facts as unknown as Fact[]) || [];
  const kept = facts.filter((f) => !f.removed);
  const g = await prisma.game.findUniqueOrThrow({
    where: { id: row.gameId },
    select: { homeScore: true, awayScore: true, status: true, homeTeam: { select: { nameHe: true, nameEn: true } }, awayTeam: { select: { nameHe: true, nameEn: true } } },
  });
  const home = g.homeTeam.nameHe || g.homeTeam.nameEn;
  const away = g.awayTeam.nameHe || g.awayTeam.nameEn;
  const headline = row.kind === 'POST' ? `${home} ${g.homeScore}-${g.awayScore} ${away}` : `${home} נגד ${away}`;
  const text = await writeAnalysis(row.kind, headline, kept);
  if (!text) return null;
  return prisma.matchAnalysis.update({ where: { id }, data: { titleHe: text.titleHe, bodyHe: text.bodyHe, aiGenerated: true, status: 'DRAFT', publishedAt: null } });
}
