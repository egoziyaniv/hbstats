import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { buildAnalyses } from '@/lib/match-analysis/job';
import { loadAnalysisContext } from '@/lib/match-analysis/history';

export const dynamic = 'force-dynamic';
export const maxDuration = 180;

// Wait this long after kickoff so the fast matchday pass has filled events and lineups.
const AFTER_KICKOFF_MS = 150 * 60 * 1000;
const LOOKBACK_MS = 7 * 86_400_000;

/**
 * Drafts the post-match analysis of Beer Sheva's latest game and the preview of the next one.
 * Guarded by CRON_SECRET (`x-cron-secret` header). Idempotent: does nothing once both drafts
 * exist; a preview missing because the next fixture wasn't set yet is created when it appears.
 * `?dry=1` returns the facts and text without writing. `?gameId=` targets a specific game.
 * Crontab: every 10 minutes via scripts/call-cron.js match-analysis.
 */
async function run(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('x-cron-secret') !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const dry = req.nextUrl.searchParams.get('dry') === '1';
  const requested = req.nextUrl.searchParams.get('gameId');
  const now = Date.now();

  const ctx = await loadAnalysisContext();
  const target = requested
    ? ctx.games.find((g) => g.id === requested)
    : [...ctx.games].reverse().find((g) => g.gf != null && g.date.getTime() < now - AFTER_KICKOFF_MS && g.date.getTime() > now - LOOKBACK_MS);
  if (!target) return NextResponse.json({ ok: true, skipped: 'no recent finished game' });

  if (!dry) {
    const next = ctx.games.find((g) => g.gf == null && g.date > target.date);
    const have = await prisma.matchAnalysis.findMany({
      where: { OR: [{ gameId: target.id, kind: 'POST' }, ...(next ? [{ gameId: next.id, kind: 'PRE' as const }] : [])] },
      select: { kind: true },
    });
    if (have.length === (next ? 2 : 1)) return NextResponse.json({ ok: true, skipped: 'drafts exist', gameId: target.id });
  }

  const pieces = await buildAnalyses(target.id, { dry, ctx });
  return NextResponse.json({
    ok: true, dry, gameId: target.id, leagueFrom: ctx.leagueFrom,
    pieces: pieces.map((p) => ({ kind: p.kind, gameId: p.gameId, headline: p.headline, status: p.status, titleHe: p.titleHe, bodyHe: p.bodyHe, facts: dry ? p.facts : p.facts.filter((f) => !f.removed).length })),
  });
}

export async function POST(req: NextRequest) { return run(req); }
export async function GET(req: NextRequest) { return run(req); }
