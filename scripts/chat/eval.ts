/**
 * Runs real chat questions through the data agent (luna, sol on escalation) and checks each answer
 * contains the numbers a hand-written query gives. Prints model, outcome, time, cost per question.
 * Spends real OpenAI money (~$0.001-0.01 per question).
 *
 * Usage: npx tsx scripts/chat/eval.ts [--only 3]
 */
import prisma from '@/lib/prisma';
import { getAiSettings, getActiveApiKey } from '@/lib/ai-settings';
import { answerWithData } from '@/lib/chat-sql/agent';

const BS = "club_key = 'api-563'";
const MEN = "category = 'men' and competition_kind <> 'friendly'";

// truth: SQL returning one row whose values must all appear in the answer.
const CASES: Array<{ q: string; truth: string }> = [
  { q: 'האם הייתה קבוצה שהבקיעה בשלושה משחקים רצופים לפחות 5 שערים בכל משחק?',
    truth: `with g as (select club_key, team_game_no, goals_for >= 5 big from chat.team_games where ${MEN}),
      r as (select *, team_game_no - row_number() over (partition by club_key order by team_game_no) grp from g where big)
      select count(*) filter (where n >= 3) as runs from (select club_key, grp, count(*) n from r group by 1, 2) x` },
  { q: 'כמה משחקים שיחק אליניב ברדה וכמה דקות?',
    truth: `select count(*) filter (where played) games, sum(minutes) minutes from chat.player_appearances where player = 'אליניב ברדה' and category = 'men'` },
  { q: 'כמה שערים כבש שלום אביטן להפועל באר שבע?',
    truth: `select count(*) goals from chat.goals where player = 'שלום אביטן' and ${BS} and not own_goal and category = 'men'` },
  { q: 'מה הניצחון הגדול ביותר של הפועל באר שבע אי פעם?',
    truth: `select goals_for, goals_against from chat.team_games where ${BS} and ${MEN} order by goals_for - goals_against desc, goals_for desc limit 1` },
  { q: 'באיזה מקום סיימה הפועל באר שבע בעונת 1975/76?',
    truth: `select position from chat.standings where ${BS} and season = '1975/76' order by played desc limit 1` },
  { q: 'מי זכתה באליפות בעונת 1961/62?',
    truth: `select team from chat.standings where competition_id = 'comp_liga_haal' and season = '1961/62' and position = 1 limit 1` },
  { q: 'כמה פעמים ניצחה הפועל באר שבע את מכבי תל אביב?',
    truth: `select count(*) wins from chat.team_games where ${BS} and opponent = 'מכבי תל אביב' and result = 'W' and ${MEN}` },
  { q: 'מי מלך השערים של ליגת העל בעונת 2024/25?',
    truth: `select player, count(*) goals from chat.goals where competition_id = 'comp_liga_haal' and season = '2024/25' and not own_goal group by player_key, player order by 2 desc limit 1` },
  { q: 'כמה שערים הבקיעה הפועל באר שבע בליגה בעונת 2025/26?',
    truth: `select sum(goals_for) goals from chat.team_games where ${BS} and season = '2025/26' and competition_kind = 'league'` },
  { q: 'מה רצף הניצחונות הארוך ביותר של הפועל באר שבע בליגה?',
    truth: `with g as (select team_game_no, result = 'W' w from chat.team_games where ${BS} and competition_kind = 'league' and category = 'men'),
      n as (select *, row_number() over (order by team_game_no) rn from g),
      r as (select rn - row_number() over (order by rn) grp from n where w)
      select max(c) longest from (select grp, count(*) c from r group by grp) x` },
  { q: 'כמה פעמים זכתה הפועל באר שבע באליפות?',
    truth: `select count(distinct season_year) titles from chat.standings where ${BS} and competition_id = 'comp_liga_haal' and position = 1 and (group_name is null or group_name ilike '%עליון%')` },
  { q: 'כמה כרטיסים צהובים קיבלה הפועל באר שבע בעונת 2025/26 בליגה?',
    truth: `select sum(yellow) yellows from chat.player_appearances where ${BS} and season = '2025/26' and competition_kind = 'league'` },
  { q: 'איזה שחקן של הפועל באר שבע שיחק הכי הרבה דקות בעונת 2025/26?',
    truth: `select player from chat.player_appearances where ${BS} and season = '2025/26' and category = 'men' group by player_key, player order by sum(minutes) desc limit 1` },
  { q: 'כמה משחקים שיחקה הפועל באר שבע מול מכבי חיפה בכל הזמנים?',
    truth: `select count(*) games from chat.team_games where ${BS} and opponent = 'מכבי חיפה' and ${MEN}` },
];

const fmt = (v: unknown) => (typeof v === 'bigint' ? String(Number(v)) : v instanceof Date ? v.toISOString().slice(0, 10) : String(v));

(async () => {
  const only = process.argv.includes('--only') ? Number(process.argv[process.argv.indexOf('--only') + 1]) : null;
  const settings = await getAiSettings();
  const key = await getActiveApiKey({ ...settings, provider: 'openai' } as typeof settings);
  if (!key) throw new Error('no OpenAI key');
  let pass = 0; let cost = 0; let sol = 0;
  const cases = only ? [CASES[only - 1]] : CASES;
  for (const [i, c] of cases.entries()) {
    const truthRow = (await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(c.truth))[0] ?? {};
    const expected = Object.values(truthRow).map(fmt).filter((v) => v && v !== 'null');
    const t0 = Date.now();
    const r = await answerWithData(key, [{ role: 'user', content: c.q }], { sqlAllowed: true });
    const plain = r.reply.replace(/[,*]/g, '');
    const ok = expected.length > 0 && expected.every((v) => plain.includes(v.replace(/,/g, '')));
    pass += ok ? 1 : 0; cost += r.costUsd; sol += r.model === 'gpt-6.1-sol' ? 1 : 0;
    console.log(`\n${ok ? 'PASS' : 'FAIL'} ${i + 1}. ${c.q}\n  expected: ${expected.join(' | ')}  [${r.model} ${r.outcome} ${((Date.now() - t0) / 1000).toFixed(1)}s $${r.costUsd.toFixed(4)}]`);
    for (const x of r.queries) if (x.error) console.log(`  sql error: ${x.error}`);
    console.log('  ' + r.reply.replace(/\n+/g, '\n  '));
  }
  console.log(`\n${pass}/${cases.length} passed · sol used ${sol}× · total $${cost.toFixed(4)}`);
  await prisma.$disconnect();
})().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
