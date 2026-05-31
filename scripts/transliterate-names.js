/**
 * transliterate-names.js — fill missing Hebrew names for referees + coaches
 * via OpenAI transliteration. Skips rows that already have valid Hebrew.
 *
 * Usage:
 *   node scripts/transliterate-names.js                  # both
 *   node scripts/transliterate-names.js --kind referees  # only referees
 *   node scripts/transliterate-names.js --kind coaches   # only coaches
 *   node scripts/transliterate-names.js --dry            # preview only
 */
'use strict';
const { PrismaClient } = require('@prisma/client');
const OpenAI = require('openai').default || require('openai');
const prisma = new PrismaClient();

const KIND = process.argv.indexOf('--kind') > -1 ? process.argv[process.argv.indexOf('--kind') + 1] : null;
const DRY = process.argv.includes('--dry');

const hasHebrew = (s) => !!s && /[֐-׿]/.test(s);

async function getApiKey() {
  const row = await prisma.siteSetting.findUnique({ where: { key: 'ai_api_key_openai' } });
  const v = row?.valueJson;
  return typeof v === 'string' ? v : null;
}

async function transliterate(client, names) {
  // Batch transliterate up to 30 names per OpenAI call.
  const prompt = `תעתק את השמות הבאים מאנגלית לעברית (transliteration, לא תרגום). השמות הם של שופטי כדורגל או מאמני כדורגל. החזר JSON עם המבנה: { "results": [{ "input": "<original>", "output": "<hebrew>" }] }. אם השם כבר בעברית, החזר אותו כמו שהוא.\n\nשמות:\n${names.map((n, i) => `${i + 1}. ${n}`).join('\n')}`;

  const res = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 2000,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: 'אתה מתעתק שמות לועזיים לעברית בדיוק רב. דוגמא: "Orel Grinfeeld" → "אורל גרינפלד".' },
      { role: 'user', content: prompt },
    ],
  });
  const text = res.choices?.[0]?.message?.content || '{}';
  try {
    const parsed = JSON.parse(text);
    const map = new Map();
    for (const r of (parsed.results || [])) {
      if (r.input && r.output && hasHebrew(r.output)) map.set(r.input, r.output);
    }
    return map;
  } catch {
    return new Map();
  }
}

async function processBatch(kind, rows, client) {
  const toTranslate = rows.filter((r) => !hasHebrew(r.nameHe)).map((r) => r.nameEn);
  if (toTranslate.length === 0) { console.log(`  no ${kind} need translation`); return; }

  console.log(`  translating ${toTranslate.length} ${kind} names...`);
  // Batch by 30 to keep prompts short.
  const batches = [];
  for (let i = 0; i < toTranslate.length; i += 30) batches.push(toTranslate.slice(i, i + 30));

  let updated = 0;
  for (const batch of batches) {
    const map = await transliterate(client, batch);
    for (const r of rows) {
      if (hasHebrew(r.nameHe)) continue;
      const he = map.get(r.nameEn);
      if (!he) continue;
      if (DRY) {
        console.log(`    [dry] ${r.nameEn} → ${he}`);
        updated++;
        continue;
      }
      if (kind === 'referees') {
        await prisma.referee.update({ where: { id: r.id }, data: { nameHe: he } });
      } else {
        await prisma.coach.update({ where: { id: r.id }, data: { nameHe: he } });
        // Mirror to denormalized field on TeamCoachAssignment for legacy reads.
        await prisma.teamCoachAssignment.updateMany({ where: { coachId: r.id }, data: { coachNameHe: he } });
      }
      updated++;
    }
  }
  console.log(`  ${kind} updated: ${updated}`);
}

async function main() {
  const apiKey = await getApiKey();
  if (!apiKey) { console.error('No OpenAI API key in SiteSetting'); process.exit(1); }
  const client = new OpenAI({ apiKey });

  if (!KIND || KIND === 'referees') {
    console.log('Referees:');
    const referees = await prisma.referee.findMany({ select: { id: true, nameEn: true, nameHe: true } });
    await processBatch('referees', referees, client);
  }
  if (!KIND || KIND === 'coaches') {
    console.log('Coaches:');
    const coaches = await prisma.coach.findMany({ select: { id: true, nameEn: true, nameHe: true } });
    await processBatch('coaches', coaches, client);
  }
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
