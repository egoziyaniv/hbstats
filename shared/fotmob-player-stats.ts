// shared/fotmob-player-stats.ts
// Category grouping + Hebrew labels for FotMob per-player match stats.
// Used by BOTH the web game page and the mobile game screen so the
// "סטטיסטיקת שחקנים" table stays identical across platforms.
//
// The English keys are exactly the stat labels FotMob emits (stored in each
// FotmobPlayerRating.stats map by scripts/scrape-fotmob.js). A category only
// renders the columns whose label actually has data for the shown players.

export interface PlayerStatCategory {
  id: string;
  titleHe: string;
  /** GK-only category — shown only when goalkeepers are present. */
  gkOnly?: boolean;
  /** Ordered English stat labels (as stored in FotmobPlayerRating.stats). */
  labels: string[];
}

export const PLAYER_STAT_CATEGORIES: PlayerStatCategory[] = [
  {
    id: 'top',
    titleHe: 'מדדים מובילים',
    labels: [
      'FotMob rating',
      'Minutes played',
      'Goals',
      'Assists',
      'Total shots',
      'Shots on target',
      'Chances created',
      'Accurate passes',
      'Defensive actions',
    ],
  },
  {
    id: 'attack',
    titleHe: 'התקפה',
    labels: [
      'Goals',
      'Total shots',
      'Shots on target',
      'Shots off target',
      'Touches in opposition box',
      'Successful dribbles',
      'Dispossessed',
    ],
  },
  {
    id: 'passes',
    titleHe: 'מסירות',
    labels: [
      'Touches',
      'Accurate passes',
      'Chances created',
      'Passes into final third',
      'Accurate crosses',
      'Accurate long balls',
    ],
  },
  {
    id: 'defense',
    titleHe: 'הגנה',
    labels: [
      'Defensive actions',
      'Tackles',
      'Interceptions',
      'Blocks',
      'Clearances',
      'Headed clearance',
      'Recoveries',
      'Dribbled past',
    ],
  },
  {
    id: 'duels',
    titleHe: 'דו-קרבים',
    labels: [
      'Duels won',
      'Duels lost',
      'Ground duels won',
      'Aerial duels won',
      'Fouls committed',
      'Was fouled',
      'Successful dribbles',
    ],
  },
  {
    id: 'gk',
    titleHe: 'שוערים',
    gkOnly: true,
    labels: [
      'Saves',
      'Goals conceded',
      'Saves inside box',
      'Diving save',
      'Acted as sweeper',
      'High claim',
      'Punches',
      'Throws',
      'Accurate long balls',
      'Accurate passes',
    ],
  },
];

/** English stat label → short Hebrew column header. */
export const PLAYER_STAT_LABEL_HE: Record<string, string> = {
  'FotMob rating': 'דירוג',
  'Minutes played': 'דקות',
  Goals: 'שערים',
  Assists: 'בישולים',
  'Total shots': 'בעיטות',
  'Shots on target': 'למסגרת',
  'Shots off target': 'מחוץ למסגרת',
  'Shot accuracy': 'דיוק בעיטה',
  'Chances created': 'מצבים שנוצרו',
  'Accurate passes': 'מסירות מדויקות',
  'Defensive actions': 'פעולות הגנה',
  Touches: 'נגיעות',
  'Touches in opposition box': 'נגיעות ברחבת היריב',
  'Successful dribbles': 'כדרורים מוצלחים',
  'Passes into final third': 'מסירות לשליש האחרון',
  'Accurate crosses': 'הרמות מדויקות',
  'Accurate long balls': 'כדורים ארוכים מדויקים',
  Dispossessed: 'איבודי כדור',
  Tackles: 'תיקולים',
  Blocks: 'חסימות',
  Clearances: 'הרחקות',
  'Headed clearance': 'הרחקות בראש',
  Interceptions: 'יירוטים',
  Recoveries: 'שחזורי כדור',
  'Dribbled past': 'עברו אותו',
  'Ground duels won': 'דו-קרב קרקע שנוצח',
  'Aerial duels won': 'דו-קרב אוויר שנוצח',
  'Was fouled': 'זכה בעבירות',
  'Fouls committed': 'עבירות',
  'Duels won': 'דו-קרבים שנוצחו',
  'Duels lost': 'דו-קרבים שהופסדו',
  Saves: 'הצלות',
  'Goals conceded': 'ספג שערים',
  'Saves inside box': 'הצלות ברחבה',
  'Diving save': 'הצלות בצלילה',
  'Acted as sweeper': 'יציאות מהשער',
  'High claim': 'תפיסות גבוהות',
  Punches: 'הרחקות אגרוף',
  Throws: 'זריקות יד',
};

export function labelHe(label: string): string {
  return PLAYER_STAT_LABEL_HE[label] || label;
}

/**
 * Format a stat value for display. Ratings show one decimal; whole numbers
 * stay integers; strings (e.g. "1/2 (50%)") pass through.
 */
export function formatStatValue(label: string, value: number | string | null | undefined): string {
  if (value == null || value === '') return '–';
  if (typeof value === 'string') return value;
  if (label === 'FotMob rating') return value.toFixed(1);
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

// ── Injured / suspended block helpers ──

const HEB_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

/** Hebrew label for the unavailability type. */
export function unavailabilityTypeHe(type: 'injury' | 'suspension'): string {
  return type === 'suspension' ? 'הרחקה' : 'פציעה';
}

/**
 * Hebrew "expected return" line. Prefers a precise Hebrew date from the ISO
 * `expectedReturnDate`; falls back to FotMob's free text ("About a week" etc.)
 * when only that is present. Returns '' when nothing is known.
 */
export function formatReturnHe(dateIso: string | null | undefined, fallbackText: string | null | undefined): string {
  if (dateIso) {
    const d = new Date(dateIso);
    if (!Number.isNaN(d.getTime())) return `צפי חזרה: ${d.getDate()} ב${HEB_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  }
  return fallbackText ? `צפי חזרה: ${fallbackText}` : '';
}
