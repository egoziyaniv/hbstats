// Frequent questions answered from a verified, parameterised query (ChatSavedQuery) instead of
// having the model write SQL: one short luna call picks the template and its parameters, the query
// runs, and a second short call words the rows. Falls through (null) whenever anything is unsure.
import OpenAI from 'openai';
import prisma from '@/lib/prisma';
import { LUNA, PRICES } from './agent';
import { runChatQuery } from './run';

export interface SavedParam { name: string; descriptionHe: string; example?: string }
export interface SavedAnswer {
  reply: string;
  savedQueryId: string;
  sql: string;
  rows: number;
  ms: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

function textOf(res: { output_text?: string }) {
  return (res.output_text || '').trim();
}

export async function answerFromSaved(apiKey: string, question: string): Promise<SavedAnswer | null> {
  const templates = await prisma.chatSavedQuery.findMany({ where: { enabled: true }, select: { id: true, intentHe: true, params: true, sql: true, answerHe: true } });
  if (!templates.length) return null;
  const client = new OpenAI({ apiKey });
  const catalogue = templates.map((t) => ({ id: t.id, intent: t.intentHe, params: t.params }));

  const pick = await client.responses.create({
    model: LUNA,
    reasoning: { effort: 'low' },
    max_output_tokens: 600,
    instructions: 'בחר תבנית שאלה שמתאימה בדיוק לשאלת המשתמש וחלץ את הפרמטרים שלה. אם אין התאמה מדויקת — החזר id=null. החזר JSON בלבד: {"id": string|null, "params": {name: value}}. ערכי שמות בעברית כפי שנכתבו בשאלה; עונה בפורמט 2024/25.',
    input: `תבניות: ${JSON.stringify(catalogue)}\nשאלה: ${question}`,
  });
  let usageIn = pick.usage?.input_tokens ?? 0;
  let usageOut = pick.usage?.output_tokens ?? 0;
  let chosen: { id?: string | null; params?: Record<string, unknown> } = {};
  try { chosen = JSON.parse(textOf(pick).match(/\{[\s\S]*\}/)?.[0] ?? '{}'); } catch { return null; }
  const template = templates.find((t) => t.id === chosen.id);
  if (!template) return null;

  const names = ((template.params as unknown as SavedParam[]) || []).map((p) => p.name);
  const values = names.map((n) => chosen.params?.[n]);
  if (values.some((v) => v == null || String(v).trim() === '')) return null;
  const result = await runChatQuery(template.sql, values.map((v) => String(v).trim()));
  if ('error' in result || !result.rows.length) return null; // let the full agent try

  const word = await client.responses.create({
    model: LUNA,
    reasoning: { effort: 'low' },
    max_output_tokens: 800,
    instructions: `ענה בעברית, קצר, רק מהשורות שמצורפות — אל תוסיף מספרים. ${template.answerHe}`,
    input: `שאלה: ${question}\nשורות: ${JSON.stringify(result.rows).slice(0, 15_000)}`,
  });
  usageIn += word.usage?.input_tokens ?? 0;
  usageOut += word.usage?.output_tokens ?? 0;
  const reply = textOf(word);
  if (!reply) return null;
  await prisma.chatSavedQuery.update({ where: { id: template.id }, data: { hits: { increment: 1 } } });
  const [pi, po] = PRICES[LUNA];
  return {
    reply, savedQueryId: template.id, sql: template.sql, rows: result.rows.length, ms: result.ms,
    inputTokens: usageIn, outputTokens: usageOut, costUsd: (usageIn * pi + usageOut * po) / 1_000_000,
  };
}
