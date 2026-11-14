/**
 * Ask the data chat one question from the command line (as an admin would) and print the answer,
 * model, outcome and queries — for checking prompt changes on the real data.
 *
 * Usage: npx tsx scripts/chat/ask.ts "השאלה"
 */
import prisma from '@/lib/prisma';
import { getAiSettings, getActiveApiKey } from '@/lib/ai-settings';
import { answerWithData } from '@/lib/chat-sql/agent';
import { ensureParser } from '@/lib/chat-sql/guard';

(async () => {
  const question = process.argv.slice(2).join(' ').trim();
  if (!question) throw new Error('usage: ask.ts "question"');
  await ensureParser();
  const apiKey = await getActiveApiKey(await getAiSettings());
  if (!apiKey) throw new Error('no API key');
  const r = await answerWithData(apiKey, [{ role: 'user', content: question }], { sqlAllowed: true });
  console.log(`[${r.model} ${r.outcome}${r.escalation ? ` — ${r.escalation}` : ''} $${r.costUsd.toFixed(4)}]`);
  console.log(r.reply);
  for (const q of r.queries) console.log(`\n-- ${q.error ? `ERROR ${q.error}` : `${q.rows} rows`}\n${q.sql}`);
  await prisma.$disconnect();
})().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
