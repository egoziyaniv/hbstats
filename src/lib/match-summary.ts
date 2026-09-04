// src/lib/match-summary.ts — AI draft of a post-match summary (title + report +
// one "match fact"), from the game's own facts. Editor reviews/edits before save.
import prisma from '@/lib/prisma';
import { getAiSettings, getActiveApiKey } from '@/lib/ai-settings';
import { chatWithClaude, chatWithOpenAI } from '@/lib/ai-providers';

export interface MatchSummaryDraft {
  reportTitleHe: string;
  reportHe: string;
  matchFactHe: string;
}

function nameOf(t: { nameHe: string | null; nameEn: string }): string {
  return t.nameHe || t.nameEn;
}

export async function generateMatchSummary(gameId: string): Promise<MatchSummaryDraft | null> {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: {
      homeTeam: { select: { nameHe: true, nameEn: true } },
      awayTeam: { select: { nameHe: true, nameEn: true } },
      competition: { select: { nameHe: true, nameEn: true } },
      events: {
        where: { type: { in: ['GOAL', 'PENALTY_GOAL', 'OWN_GOAL', 'RED_CARD'] } },
        select: { type: true, minute: true, teamId: true, player: { select: { nameHe: true, nameEn: true } } },
        orderBy: { minute: 'asc' },
      },
    },
  });
  if (!game) return null;

  const settings = await getAiSettings();
  const apiKey = await getActiveApiKey(settings);
  if (!apiKey) return null;

  const homeName = nameOf(game.homeTeam);
  const awayName = nameOf(game.awayTeam);
  const facts = {
    result: `${homeName} ${game.homeScore ?? 0} - ${game.awayScore ?? 0} ${awayName}`,
    competition: game.competition?.nameHe || game.competition?.nameEn || null,
    round: game.roundNameHe || game.roundNameEn || null,
    events: game.events.map((e) => ({
      min: e.minute,
      type: e.type,
      team: e.teamId === game.homeTeamId ? homeName : awayName,
      player: e.player ? e.player.nameHe || e.player.nameEn : null,
    })),
  };

  const prompt =
    `אתה כתב כדורגל ישראלי. על בסיס העובדות בלבד — בלי להמציא מספרים, שמות או אירועים — כתוב סיכום למשחק שהסתיים. ` +
    `החזר JSON תקין בלבד, ללא טקסט נוסף וללא סימוני קוד, במבנה המדויק: ` +
    `{"title":"כותרת קצרה וקולעת","report":"2-4 משפטים בעברית","fact":"פקט אחד קצר ומעניין מהמשחק"}. ` +
    `עובדות: ${JSON.stringify(facts)}`;
  const messages = [{ role: 'user' as const, content: prompt }];

  try {
    const raw = (settings.provider === 'openai'
      ? await chatWithOpenAI(apiKey, messages, 'gpt-5.6-luna')
      : await chatWithClaude(apiKey, messages)).trim();
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const parsed = JSON.parse(m[0]);
    const draft: MatchSummaryDraft = {
      reportTitleHe: String(parsed.title || '').trim(),
      reportHe: String(parsed.report || '').trim(),
      matchFactHe: String(parsed.fact || '').trim(),
    };
    return draft.reportHe ? draft : null;
  } catch {
    return null;
  }
}
