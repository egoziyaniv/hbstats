/**
 * The first saved queries — the question types the owner named (a player's games, minutes, starts,
 * sub appearances and goals, career or season) plus a club's record against another and its finish
 * in a season. Idempotent by title: an existing one is left as the admin edited it.
 *
 * Usage: npx tsx scripts/chat/seed-saved-queries.ts
 */
import prisma from '@/lib/prisma';
import { checkSql, ensureParser } from '@/lib/chat-sql/guard';

const PLAYER = { name: 'player', descriptionHe: 'שם השחקן כפי שנכתב', example: 'אליניב ברדה' };
const SEASON = { name: 'season', descriptionHe: 'עונה בפורמט 2024/25', example: '2015/16' };
const CLUB = { name: 'club', descriptionHe: 'שם הקבוצה', example: 'הפועל באר שבע' };
const OPPONENT = { name: 'opponent', descriptionHe: 'שם הקבוצה היריבה', example: 'מכבי תל אביב' };
const SAME_NAME = 'אם יש בשורות כמה player_key בקבוצות שונות — אלה כנראה שחקנים שונים: הצג כל אחד בנפרד ושאל למי הכוונה. ציין שהרכבים ודקות יש רק מ-2009/10.';

const SEEDS = [
  {
    titleHe: 'הופעות ודקות של שחקן — כל העונות',
    intentHe: 'כמה משחקים / דקות שיחק שחקן, כמה פעמים פתח, כמה נכנס כמחליף — בלי עונה מסוימת',
    params: [PLAYER],
    sql: `select player_key, min(player) as player, string_agg(distinct team, ', ') as teams, min(season) as first_season, max(season) as last_season,
  count(*) filter (where played) as games, count(*) filter (where started) as starts, count(*) filter (where came_on) as off_bench,
  sum(minutes) as minutes, sum(goals) as goals
from chat.player_appearances
where player ilike '%' || $1 || '%' and category = 'men'
group by player_key order by games desc`,
    answerHe: SAME_NAME,
  },
  {
    titleHe: 'הופעות ודקות של שחקן בעונה',
    intentHe: 'כמה משחקים / דקות שיחק שחקן, פתיחות וכניסות כמחליף — בעונה מסוימת',
    params: [PLAYER, SEASON],
    sql: `select player_key, min(player) as player, string_agg(distinct team, ', ') as teams, season,
  count(*) filter (where played) as games, count(*) filter (where started) as starts, count(*) filter (where came_on) as off_bench,
  sum(minutes) as minutes, sum(goals) as goals
from chat.player_appearances
where player ilike '%' || $1 || '%' and season = $2 and category = 'men'
group by player_key, season order by games desc`,
    answerHe: SAME_NAME,
  },
  {
    titleHe: 'שערים של שחקן — כל העונות',
    intentHe: 'כמה שערים כבש שחקן בסך הכל / בכל העונות / בקריירה',
    params: [PLAYER],
    sql: `select player_key, min(player) as player, team, min(season) as first_season, max(season) as last_season,
  count(*) as goals, count(*) filter (where penalty) as penalties
from chat.goals
where player ilike '%' || $1 || '%' and not own_goal and category = 'men'
group by player_key, team order by goals desc`,
    answerHe: `${SAME_NAME} שערים לפני 2006 קיימים אצלנו בעיקר במשחקי באר שבע.`,
  },
  {
    titleHe: 'שערים של שחקן בעונה',
    intentHe: 'כמה שערים כבש שחקן בעונה מסוימת',
    params: [PLAYER, SEASON],
    sql: `select player_key, min(player) as player, team, season, competition, count(*) as goals
from chat.goals
where player ilike '%' || $1 || '%' and season = $2 and not own_goal and category = 'men'
group by player_key, team, season, competition order by goals desc`,
    answerHe: `${SAME_NAME} פרט לפי מסגרת (ליגה/גביע) אם יש יותר מאחת.`,
  },
  {
    titleHe: 'מאזן קבוצה מול קבוצה',
    intentHe: 'מה המאזן / כמה ניצחונות, תיקו והפסדים של קבוצה מול קבוצה אחרת בכל הזמנים',
    params: [CLUB, OPPONENT],
    sql: `select t.team, t.opponent, count(*) as games,
  count(*) filter (where result = 'W') as wins, count(*) filter (where result = 'D') as draws, count(*) filter (where result = 'L') as losses,
  sum(goals_for) as goals_for, sum(goals_against) as goals_against, min(season) as first_season, max(season) as last_season
from chat.team_games t
where t.club_key in (select club_key from chat.clubs where club ilike '%' || $1 || '%')
  and t.opponent_key in (select club_key from chat.clubs where club ilike '%' || $2 || '%')
  and category = 'men' and competition_kind <> 'friendly'
group by t.club_key, t.opponent_key, t.team, t.opponent order by games desc`,
    answerHe: 'אם יש כמה צמדי קבוצות (שמות דומים) — הצג את המתאים ביותר והזכר את האחרים. לפני שנות ה-90 יש לנו בעיקר את משחקי באר שבע.',
  },
  {
    titleHe: 'מקום של קבוצה בעונה',
    intentHe: 'באיזה מקום סיימה קבוצה בעונה מסוימת / כמה נקודות צברה',
    params: [CLUB, SEASON],
    sql: `select team, season, competition, group_name, position, played, won, drawn, lost, goals_for, goals_against, points
from chat.standings
where club_key in (select club_key from chat.clubs where club ilike '%' || $1 || '%') and season = $2
order by played desc`,
    answerHe: 'אם יש כמה שורות (שלב סדיר ופלייאוף) — תן את המקום הסופי ופרט.',
  },
];

(async () => {
  await ensureParser();
  for (const s of SEEDS) {
    const check = checkSql(s.sql, { allowParams: true });
    if ('reason' in check) throw new Error(`${s.titleHe}: ${check.reason}`);
    const exists = await prisma.chatSavedQuery.findFirst({ where: { titleHe: s.titleHe }, select: { id: true } });
    if (exists) { console.log('kept   ', s.titleHe); continue; }
    await prisma.chatSavedQuery.create({ data: { ...s, params: s.params } });
    console.log('created', s.titleHe);
  }
  await prisma.$disconnect();
})().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
