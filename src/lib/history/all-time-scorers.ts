/**
 * Authoritative all-time top scorers of the Israeli top division.
 *
 * The materialized `CompetitionLeaderboardEntry` data is incomplete before ~2000
 * (missing seasons/clubs), so it can't produce a correct all-time ranking — it
 * showed Mizrahi at 134 when his real total is 206. This curated list is the
 * canonical source for the "מלך השערים ההיסטורי" card. Source: owner-provided
 * canonical list, 2026-07-20. Update `active` players' totals as they score.
 */
export interface AllTimeScorer {
  rank: number;
  nameHe: string;
  goals: number;
  active: boolean;
}

export const LEAGUE_ALL_TIME_SCORERS: AllTimeScorer[] = [
  { rank: 1, nameHe: 'אלון מזרחי', goals: 206, active: false },
  { rank: 2, nameHe: 'עודד מכנס', goals: 196, active: false },
  { rank: 3, nameHe: 'משה רומנו', goals: 193, active: false },
  { rank: 4, nameHe: 'אבי נמני', goals: 192, active: false },
  { rank: 5, nameHe: 'ערן זהבי', goals: 177, active: false },
  { rank: 6, nameHe: 'שי הולצמן', goals: 169, active: false },
  { rank: 7, nameHe: 'מרדכי שפיגלר', goals: 168, active: false },
  { rank: 8, nameHe: 'אורי מלמיליאן', goals: 159, active: false },
  { rank: 9, nameHe: 'דוד לביא', goals: 158, active: false },
  { rank: 10, nameHe: 'נחום סטלמך', goals: 155, active: false },
  { rank: 11, nameHe: 'שייע פייגנבוים', goals: 147, active: false },
  { rank: 12, nameHe: 'גדעון דמתי', goals: 142, active: false },
  { rank: 13, nameHe: 'איציק זוהר', goals: 141, active: false },
  { rank: 14, nameHe: 'אלירן עטר', goals: 137, active: true },
  { rank: 15, nameHe: 'שייע גלזר', goals: 136, active: false },
  { rank: 16, nameHe: 'מוטי קקון', goals: 134, active: false },
  { rank: 17, nameHe: 'יהודה שהרבני', goals: 131, active: false },
  { rank: 18, nameHe: 'אלי דריקס', goals: 128, active: false },
  { rank: 19, nameHe: 'בני טבק', goals: 128, active: false },
  { rank: 20, nameHe: "עמיר תורג'מן", goals: 125, active: false },
  { rank: 21, nameHe: 'ישראל פוגל', goals: 123, active: false },
  { rank: 22, nameHe: 'ראובן עטר', goals: 123, active: false },
  { rank: 23, nameHe: 'ויקטור סרוסי', goals: 122, active: false },
  { rank: 24, nameHe: 'אלי אוחנה', goals: 121, active: false },
  { rank: 25, nameHe: 'בועז קופמן', goals: 119, active: false },
  { rank: 26, nameHe: 'שלום אביטן', goals: 118, active: false },
  { rank: 27, nameHe: 'זאהי ארמלי', goals: 114, active: false },
  { rank: 28, nameHe: 'משה אוננה', goals: 114, active: false },
  { rank: 29, nameHe: "אלי בן רימוז'", goals: 106, active: false },
  { rank: 30, nameHe: 'זכריה רצבי', goals: 106, active: false },
  { rank: 31, nameHe: 'שלמה לוי', goals: 106, active: false },
  { rank: 32, nameHe: 'חזי שירזי', goals: 105, active: false },
  { rank: 33, nameHe: 'עומר אצילי', goals: 104, active: true },
  { rank: 34, nameHe: 'אסי טובי', goals: 103, active: false },
  { rank: 35, nameHe: 'קובי רפואה', goals: 103, active: false },
  { rank: 36, nameHe: 'משה סיני', goals: 102, active: false },
  { rank: 37, nameHe: 'גיורא שפיגל', goals: 101, active: false },
  { rank: 38, nameHe: 'איתי שכטר', goals: 100, active: false },
];
