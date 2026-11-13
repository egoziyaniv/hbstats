// The chat question log: one row per question, for learning what fans ask and where answers fail.
import type { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import type { QueryLog } from './agent';

/** Groups variants of one question: lower-case, no niqqud or punctuation, single spaces. */
export function normalizeQuestion(q: string): string {
  return q
    .toLowerCase()
    .replace(/[֑-ׇ]/g, '')
    .replace(/["'`״׳?!.,:;()\[\]{}\-–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface LogEntry {
  userId: string | null;
  question: string;
  answer: string | null;
  queries: QueryLog[];
  savedQueryId?: string | null;
  model: string;
  outcome: string;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
}

export async function logQuestion(e: LogEntry): Promise<string | null> {
  try {
    const row = await prisma.chatQuestion.create({
      data: {
        userId: e.userId,
        question: e.question.slice(0, 1000),
        normalized: normalizeQuestion(e.question).slice(0, 1000),
        answer: e.answer?.slice(0, 8000) ?? null,
        queries: e.queries as unknown as Prisma.InputJsonValue,
        savedQueryId: e.savedQueryId ?? null,
        model: e.model,
        outcome: e.outcome,
        latencyMs: e.latencyMs,
        inputTokens: e.inputTokens ?? 0,
        outputTokens: e.outputTokens ?? 0,
        costUsd: e.costUsd ?? 0,
      },
      select: { id: true },
    });
    return row.id;
  } catch (err) {
    console.error('[chat-log] failed:', (err as Error).message);
    return null; // logging must never break the answer
  }
}

/** Nightly: drop questions older than a year. */
export async function pruneChatLog(days = 365): Promise<number> {
  const r = await prisma.chatQuestion.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - days * 86_400_000) } } });
  return r.count;
}
