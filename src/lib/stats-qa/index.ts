import { getQuestion, REGISTRY } from './registry';
import { getNarrative, getDataVersion } from './narrative';
import type { ResolveCtx, StatAnswer } from './types';

export { REGISTRY };
export type { StatAnswer };

export interface AnsweredCard extends StatAnswer { id: string; titleHe: string; cardType: string; narrative: string | null }

export async function answerQuestion(id: string, ctx: ResolveCtx): Promise<AnsweredCard | null> {
  const q = getQuestion(id);
  if (!q) return null;
  const answer = await q.resolve(ctx);
  const questionKey = [id, ctx.clubKey, ctx.rivalKey].filter(Boolean).join(':');
  const dataVersion = await getDataVersion();
  const titleHe = q.titleHe(ctx);
  const narrative = await getNarrative(questionKey, dataVersion, titleHe, answer);
  return { ...answer, id, titleHe, cardType: q.cardType, narrative };
}

/** Registry metadata for building the chip UI (no resolution). */
export function listQuestions() {
  return REGISTRY.map((q) => ({ id: q.id, scope: q.scope, cardType: q.cardType, needsClub: q.needsClub, needsRival: !!q.needsRival, titleHe: q.titleHe({}) }));
}
