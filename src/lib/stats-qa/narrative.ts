import { prisma } from '@/lib/prisma';
import { getAiSettings, getActiveApiKey } from '@/lib/ai-settings';
import { chatWithClaude } from '@/lib/ai-providers';
import type { StatAnswer } from './types';

export const STAT_DATA_VERSION_KEY = 'stat_data_version';

export async function getDataVersion(): Promise<string> {
  const row = await prisma.siteSetting.findUnique({ where: { key: STAT_DATA_VERSION_KEY } });
  return typeof row?.valueJson === 'string' ? row.valueJson : '0';
}

export async function getNarrative(
  questionKey: string,
  dataVersion: string,
  titleHe: string,
  answer: StatAnswer
): Promise<string | null> {
  if (!answer.headline) return null;
  const cached = await prisma.statNarrative.findUnique({
    where: { questionKey_dataVersion: { questionKey, dataVersion } },
  });
  if (cached) return cached.text;
  try {
    const settings = await getAiSettings();
    const apiKey = await getActiveApiKey(settings);
    if (!apiKey) return null;
    const facts = JSON.stringify({ headline: answer.headline, secondary: answer.secondary, top: answer.top?.slice(0, 3) });
    const prompt =
      `אתה עורך סטטיסטיקות כדורגל ישראלי. נתון לך נתון אמת. כתוב משפט הקשר אחד בעברית (עד 18 מילים), ` +
      `בלי להמציא מספרים שאינם בנתון, בלי לחזור על המספר. שאלה: "${titleHe}". נתון: ${facts}`;
    const text = (await chatWithClaude(apiKey, [{ role: 'user', content: prompt }])).trim();
    if (!text) return null;
    try {
      await prisma.statNarrative.create({ data: { questionKey, dataVersion, text } });
    } catch {
      // Cache write failure should not lose an already-generated answer.
    }
    return text;
  } catch {
    return null;
  }
}
