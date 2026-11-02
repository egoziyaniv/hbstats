// AI prose from the engine's facts. The model only words them; every number comes from a fact,
// and check.ts flags any that doesn't. Fails soft (null) — the draft then carries facts only.
import { getAiSettings, getActiveApiKey } from '@/lib/ai-settings';
import { chatWithClaude, chatWithOpenAI } from '@/lib/ai-providers';
import type { AnalysisKind, Fact } from './types';

export interface AnalysisText { titleHe: string; bodyHe: string }

export function buildPrompt(kind: AnalysisKind, headline: string, facts: Fact[]): string {
  const what = kind === 'POST' ? `ניתוח אחרי המשחק ${headline}` : `טור "לקראת" המשחק ${headline}`;
  return [
    'אתה כותב טור סטטיסטי בעברית על הפועל באר שבע, בסגנון של כתב שאוהב מספרים: חד, עם הקשר, בלי קלישאות.',
    `כתוב ${what}. השתמש אך ורק בעובדות שלמטה — אסור להוסיף מספר, שנה, שם או טענה שלא מופיעים בהן.`,
    'כשאתה מצטט עובדה, שמור על טווח הנתונים שלה (למשל "בליגה הבכירה מאז 1991/92").',
    'מבנה: סעיפים ממוספרים (1. 2. 3.), כל סעיף פסקה של 2-4 משפטים, סעיף לכל עובדה או לשתיים קשורות.',
    'החזר JSON תקין בלבד, בלי טקסט נוסף: {"title":"כותרת קצרה","body":"הסעיפים, מופרדים בשורה ריקה"}.',
    `עובדות: ${JSON.stringify(facts.map((f) => ({ fact: f.textHe, coverage: f.coverageHe })))}`,
  ].join('\n');
}

export async function writeAnalysis(kind: AnalysisKind, headline: string, facts: Fact[]): Promise<AnalysisText | null> {
  if (!facts.length) return null;
  try {
    const settings = await getAiSettings();
    const apiKey = await getActiveApiKey(settings);
    if (!apiKey) return null;
    const messages = [{ role: 'user' as const, content: buildPrompt(kind, headline, facts) }];
    const raw = (settings.provider === 'openai'
      ? await chatWithOpenAI(apiKey, messages, 'gpt-5.6-luna')
      : await chatWithClaude(apiKey, messages)).trim();
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const parsed = JSON.parse(m[0]);
    const bodyHe = String(parsed.body || '').trim();
    return bodyHe ? { titleHe: String(parsed.title || '').trim(), bodyHe } : null;
  } catch {
    return null;
  }
}
