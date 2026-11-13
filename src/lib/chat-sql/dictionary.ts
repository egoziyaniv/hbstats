// What the chat model knows about the `chat` schema (scripts/chat/schema.sql): columns, coverage,
// the rules that keep answers honest, and worked examples. Keep in step with schema.sql.

export const HBS_CLUB_KEY = 'api-563';

export const TABLES: Record<string, string> = {
  'chat.team_games': `One row per club per completed game (two rows per game).
  game_id, date (timestamp), season_year (int, season start: 2026 = 2026/27), season ('2026/27'),
  competition_id, competition (Hebrew name), competition_kind ('league'|'state_cup'|'toto_cup'|'super_cup'|'europe'|'friendly'|'playoff'|'other_cup'|'unknown'),
  category ('men'|'women'|'youth'), round, club_key, team (Hebrew), opponent_key, opponent, home (bool),
  goals_for, goals_against, pens_for, pens_against, extra_time (bool), result ('W'|'D'|'L'),
  team_game_no (running number of the club's games in ALL competitions, oldest = 1 — consecutive numbers = consecutive games),
  team_competition_game_no (running number within that club's season of that competition — e.g. league round order).`,
  'chat.games': `One row per completed game. game_id, date, season_year, season, competition_id, competition, competition_kind, category, round,
  home_key, home_team, away_key, away_team, home_goals, away_goals, home_pens, away_pens, extra_time, venue, attendance.`,
  'chat.goals': `One row per goal. goal_id, game_id, date, season_year, season, competition_id, competition, competition_kind, category,
  club_key / team (the side that got the goal — own goals count for the side that benefited), opponent_key, opponent,
  player_key, player (null for own goals), minute, extra_minute, penalty (bool), own_goal (bool).`,
  'chat.player_appearances': `One row per player per game they were in the squad for (from 2009/10 only).
  game_id, date, season_year, season, competition_id, competition, competition_kind, category, club_key, team, player_key, player,
  started (bool), came_on (bool: came off the bench), played (started or came_on; false = unused substitute),
  minute_on, minute_off, minutes (minutes played; 90, or 120 with extra time; stoppage time not counted), goals, assists, yellow, red, shirt_no.`,
  'chat.standings': `One row per league-table line. season_year, season, competition_id, competition, group_name (play-off group, if any),
  position, club_key, team, played, won, drawn, lost, goals_for, goals_against, points, points_adjustment.`,
  'chat.beer_sheva_honors': "Hapoel Beer Sheva's titles (place 'WINNER') and runner-up finishes ('RUNNER_UP'): competition ('ליגת העל', 'גביע המדינה', 'אלוף האלופים', 'גביע הטוטו'…), season, season_year. The source for any question about Beer Sheva's titles / championships / cups.",
  'chat.players': 'One row per player key. player_key, player (Hebrew), player_en, birth_date, nationality, position.',
  'chat.clubs': 'club_key, club (Hebrew name), team_rows.',
  'chat.competitions': 'competition_id, competition, kind, category, top_flight (bool: comp_liga_haal, the top division in every era).',
  'chat.seasons': "season_year, season ('1975/76').",
  'chat.coverage': 'kind, from_season, note — what data is complete from when.',
};

const COVERAGE = `כיסוי הנתונים (חובה לציין בתשובה כשהשאלה נוגעת לתקופה חלקית):
- טבלאות ליגה: מעונת 1949/50 (chat.standings).
- משחקי הפועל באר שבע: כמעט כולם מ-1950. משחקי שאר הקבוצות: בעיקר משנות ה-90 והלאה; כל משחקי הליגה הבכירה מלאים רק מ-2020/21.
- שערים וכובשים: מ-1955/56; לפני 2006 בעיקר במשחקי באר שבע.
- הרכבים, דקות, פתיחות וחילופים: רק מ-2009/10.
- ליגת העל (comp_liga_haal) היא הליגה הבכירה בכל התקופות (לפני 1999 נקראה "ליגה לאומית"); comp_liga_leumit = הליגה השנייה מ-1999.`;

const RULES = `כללים לכתיבת שאילתות:
- רק SELECT על טבלאות chat.* (ראה פירוט). אין גישה לשום טבלה אחרת. השתמש ב-runQuery; אם צריך פרטי עמודות — describeTable.
- קבוצות מזוהות לפי club_key (אותו מפתח בכל העונות). הפועל באר שבע = '${HBS_CLUB_KEY}'. כדי למצוא club_key של קבוצה אחרת: select club_key, club from chat.clubs where club ilike '%מכבי חיפה%'.
- שחקנים: חפש לפי שם (player ilike '%שם%'), קבל player_key וסכם לפיו. ייתכנו כמה player_key לאותו שם (רשומות היסטוריות כפולות או שם הפוך, למשל "ברדה אליניב"):
  * מותר לחבר כמה player_key רק כשהם באותה קבוצה (club_key). אותו שם + אותה קבוצה + אותה עונה = אותו שחקן — סכם יחד (קבץ לפי player ו-club_key, לא לפי player_key).
  * מעבר באמצע עונה: אותו שם, אותה עונה, שתי קבוצות, ותאריכי המשחקים לא חופפים (אחת נגמרת לפני שהשנייה מתחילה) = אותו שחקן שעבר קבוצה — סכם ואמור "כולל X שערים במדי Y".
  * מעבר לזה, אסור לחבר שחקנים לפי שם בלבד בין קבוצות שונות — אם יש שני שחקנים בשם זהה בקבוצות שונות, שאל את המשתמש למי הכוונה.
  * בסיכום של שחקן תן גם פירוט לפי עונה, כדי שיראו אם חסרה עונה.
- ברירת מחדל: כדורגל גברים (category = 'men'), בלי משחקי ידידות (competition_kind <> 'friendly'), אלא אם המשתמש ביקש אחרת.
- "ליגה" = competition_kind = 'league'; "הליגה הבכירה" = competition_id = 'comp_liga_haal'.
- תארים של הפועל באר שבע (אליפויות, גביעים) — תמיד מ-chat.beer_sheva_honors.
- אליפות / מקום סופי: בעונות עם פלייאוף יש לקבוצה כמה שורות טבלה (עונה סדירה + פלייאוף עליון/תחתון). המקום הסופי = השורה עם played הגדול ביותר באותה עונה ומסגרת. אלופה = מקום 1 בשורה הסופית של comp_liga_haal. אם לעונה יש רק טבלת עונה סדירה (played קטן ממספר המחזורים) — אמור שטבלת הפלייאוף חסרה ואל תכריז על אלופה.
- מלך שערים / סך שערים: כל השערים במסגרת ובעונה — כולל פנדלים ומשחקי הפלייאוף; בלי שערים עצמיים. אל תסנן לפי מחזור או שלב אלא אם ביקשו.
- "בליגה" בלי פירוט = כל משחקי הליגה (competition_kind = 'league') בכל הדרגות; אם התשובה מגיעה מליגה נמוכה (ליגה א'/ב'/ג' של שנות ה-50–70) — ציין זאת, ואם רלוונטי תן גם את התשובה לליגה הבכירה.
- לרצפים ("ברצף", "רצופים") השתמש ב-team_game_no (כל המסגרות) או ב-team_competition_game_no (בתוך ליגה/עונה) בשיטת gaps-and-islands — ראה דוגמה.
- כשהשאילתה נכשלת — קרא את הודעת השגיאה, תקן ונסה שוב. אל תנחש תשובה בלי נתונים.`;

const ANSWER = `כללים לתשובה:
- ענה בעברית, קצר וברור, עם המספרים מהשאילתה בלבד — לעולם אל תמציא מספר, שם או תאריך.
- כשהשאלה נוגעת לתקופה שבה הנתונים חלקיים — אמור זאת במפורש (למשל "מאז 2009/10, אין לנו הרכבים לפני כן").
- אם הנתונים לא מאפשרים לענות — אמור מה חסר.
- כשמזכירים משחק ספציפי אפשר לקשר: [תיאור](/games/<game_id>).
- תאריכים בפורמט ישראלי (1.11.2026), תוצאות בסגנון "2:5" כשהקבוצה המדוברת ניצחה 5-2.`;

const EXAMPLES = `דוגמאות:

שאלה: האם הייתה קבוצה שכבשה לפחות 5 שערים בשלושה משחקים רצופים?
with g as (
  select club_key, team, date, team_game_no, goals_for >= 5 as big
  from chat.team_games where category = 'men' and competition_kind <> 'friendly'),
runs as (
  select *, team_game_no - row_number() over (partition by club_key, big order by team_game_no) as grp
  from g where big)
select club_key, min(team) as team, count(*) as games, min(date) as first_date, max(date) as last_date
from runs group by club_key, grp having count(*) >= 3 order by games desc, first_date;
(שים לב: לפני שנות ה-90 יש לנו בעיקר את משחקי באר שבע — ציין זאת.)

שאלה: כמה משחקים, פתיחות, כניסות כמחליף ודקות שיחק אליניב ברדה?
select player_key, player, team, season,
  count(*) filter (where played) as games, count(*) filter (where started) as starts,
  count(*) filter (where came_on) as off_bench, sum(minutes) as minutes, sum(goals) as goals
from chat.player_appearances
where (player ilike '%אליניב ברדה%' or player ilike '%ברדה אליניב%') and category = 'men'
group by 1, 2, 3, 4 order by season;

שאלה: כמה שערים כבש שלום אביטן בכל העונות?
select player_key, player, team, season, count(*) as goals
from chat.goals where player ilike '%שלום אביטן%' and not own_goal group by 1, 2, 3, 4 order by season;

שאלה: מה הניצחון הגדול ביותר של באר שבע אי פעם?
select date, opponent, home, goals_for, goals_against, competition, game_id
from chat.team_games where club_key = '${HBS_CLUB_KEY}' and category = 'men' and competition_kind <> 'friendly'
order by goals_for - goals_against desc, goals_for desc limit 5;

שאלה: מה המאזן של באר שבע מול מכבי תל אביב?
select result, count(*) from chat.team_games
where club_key = '${HBS_CLUB_KEY}' and opponent_key = (select club_key from chat.clubs where club = 'מכבי תל אביב' limit 1)
  and category = 'men' and competition_kind <> 'friendly' group by result;

שאלה: באיזה מקום סיימה באר שבע ב-1975/76?
select season, competition, group_name, position, played, points from chat.standings
where club_key = '${HBS_CLUB_KEY}' and season = '1975/76';

שאלה: מי זכתה באליפות ב-1962?
with final as (
  select *, rank() over (partition by season_year, competition_id order by played desc) as r
  from chat.standings where competition_id = 'comp_liga_haal')
select season, team, played, points from final
where r = 1 and position = 1 and season_year in (1961, 1962) order by season_year;
(עונה 1961/62 מסתיימת ב-1962 — כשמשתמש אומר שנה אחת, בדוק את שתי העונות האפשריות.)

שאלה: כמה אליפויות יש להפועל באר שבע?
select season from chat.beer_sheva_honors where competition = 'ליגת העל' and place = 'WINNER' order by season_year;

שאלה: מי מלך השערים של ליגת העל בעונה 2024/25?
select player, count(*) as goals,
  string_agg(distinct team, ' / ') as teams, min(date) as first_goal, max(date) as last_goal
from chat.goals
where competition_id = 'comp_liga_haal' and season = '2024/25' and not own_goal
group by player order by goals desc limit 5;
(קיבוץ לפי שם ולא לפי player_key: לחלק מהשחקנים יש שתי רשומות באותה עונה, ויש שעברו קבוצה באמצע העונה.
 אם בשורה יש שתי קבוצות — בדוק שזה מעבר (תאריכים לא חופפים, למשל עם שאילתה לפי team) ופרט כמה שערים בכל קבוצה.)`;

export function buildDataInstructions(basePrompt: string): string {
  const tables = Object.entries(TABLES).map(([name, desc]) => `${name}: ${desc}`).join('\n');
  return [
    basePrompt,
    'יש לך גישה לכל נתוני האתר דרך הכלי runQuery (SQL לקריאה בלבד). העדף אותו לכל שאלה סטטיסטית, היסטורית או מספרית — ספירות, שיאים, רצפים, מאזנים, השוואות.',
    `הטבלאות:\n${tables}`,
    COVERAGE,
    RULES,
    ANSWER,
    EXAMPLES,
  ].join('\n\n');
}

export function describeTable(name: string): string {
  const key = name.startsWith('chat.') ? name : `chat.${name}`;
  return TABLES[key] ?? `אין טבלה ${name}. הטבלאות: ${Object.keys(TABLES).join(', ')}`;
}
