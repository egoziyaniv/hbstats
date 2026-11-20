// Match a YouTube video (title + publish date + length) to a Hapoel Beer Sheva game.
// Pure and unit-tested — the scanner and the admin "paste a link" flow both use it.
//
// Signals: the opponent's name in the title (required), the score, a full date in the title,
// a year / season in the title, and the upload date (highlights go up within days of the game).
// A signal that is present and contradicts the game rules that game out.

export interface HbsGame {
  id: string;
  dateTime: Date;
  homeName: string;
  awayName: string;
  homeScore: number | null;
  awayScore: number | null;
  hbsHome: boolean;
  round?: number | null; // league round number when known
}

export interface VideoInput {
  title: string;
  publishedAt: Date | null;
  durationSec: number | null;
}

export interface GameCandidate {
  gameId: string;
  points: number;
  reasons: string[];
}

export type VideoKind = 'recap' | 'full';
export type Confidence = 'high' | 'medium' | 'none';

export interface MatchResult {
  relevant: boolean; // a Beer Sheva match video at all (not a press conference, a short, ...)
  kind: VideoKind;
  candidates: GameCandidate[]; // best first
  confidence: Confidence;
  why: string;
}

const DAY = 86_400_000;
const TEAM_PREFIXES = new Set(['הפועל', 'מכבי', 'ביתר', 'בני', 'עירוני', 'הכח', 'הכוח', 'מס', 'אסא', 'בית', 'סקציה', 'אחי', 'צעירי']);

/** Hebrew title normaliser: expands club abbreviations, unifies spellings, drops punctuation. */
export function normalizeHe(input: string): string {
  return ` ${input} `
    .replace(/[״”“]/g, '"').replace(/[׳’‘`]/g, "'")
    .replace(/ב"ש/g, 'באר שבע').replace(/פ"ת/g, 'פתח תקווה').replace(/ת"א/g, 'תל אביב')
    .replace(/ק"ש/g, 'קרית שמונה').replace(/ראשל"צ/g, 'ראשון לציון').replace(/בית"ר/g, 'ביתר')
    .replace(/מ\.ס\.?/g, 'מס ').replace(/באר-שבע/g, 'באר שבע')
    .replace(/קריית/g, 'קרית').replace(/תקוה/g, 'תקווה').replace(/הכוח/g, 'הכח')
    .replace(/["'.,!?:;|()[\]{}–—_\-/\\#@*]/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

const HBS_RE = /באר שבע|beer ?sheva|be ?er ?sheva|beersheba|beer-sheva/;
const IGNORE_RE = /מסיבת עיתונאים|ראיון|מראיין|פודקאסט|podcast|interview|press conference|שידור חי|לייב|\blive\b|בשידור|תחזית|preview|קדימון|אימון|training|fifa|pes|efootball|שיר|אוהדים שרים/;
const RECAP_RE = /תקציר|highlights|שערים|כל השערים|סיכום|גולים|goals|תקצירי/;
const FULL_RE = /משחק מלא|המשחק המלא|full match|full game/;

/** Cheap pre-filter for search hits: does the title mention Beer Sheva? */
export const mentionsHbs = (title: string) => HBS_RE.test(normalizeHe(title));

function stripHbs(t: string): string {
  return t.replace(/הפועל באר שבע|באר שבע|hapoel beer ?sheva|beer ?sheva/g, ' ');
}

/** Does the (normalised, Beer-Sheva-stripped) title name this opponent? 'full' | 'short' | null. */
export function opponentMatch(title: string, opponentHe: string): 'full' | 'short' | null {
  const opp = normalizeHe(opponentHe).trim();
  if (!opp) return null;
  if (` ${title} `.includes(` ${opp} `)) return 'full';
  const words = opp.split(' ');
  const prefix = TEAM_PREFIXES.has(words[0]) ? words[0] : null;
  const core = (prefix ? words.slice(1) : words).join(' ');
  if (core.length < 3) return null;
  const tWords = title.split(' ').filter(Boolean);
  const coreWords = core.split(' ');
  for (let i = 0; i + coreWords.length <= tWords.length; i++) {
    if (tWords.slice(i, i + coreWords.length).join(' ') !== core) continue;
    const before = tWords[i - 1];
    // "הפועל חיפה" must not match "מכבי חיפה".
    if (before && TEAM_PREFIXES.has(before) && before !== prefix) continue;
    return 'short';
  }
  return null;
}

export interface TitleFacts {
  scores: Array<[number, number]>;
  date: Date | null;
  years: number[];
}

/** Scores, a full date and years mentioned in a raw title. */
export function titleFacts(raw: string): TitleFacts {
  let t = raw;
  let date: Date | null = null;
  const years = new Set<number>();
  const dm = t.match(/(?<!\d)(\d{1,2})[./](\d{1,2})[./](\d{4}|\d{2})(?!\d)/);
  if (dm) {
    let y = Number(dm[3]);
    if (y < 100) y += y > 40 ? 1900 : 2000;
    const d = new Date(Date.UTC(y, Number(dm[2]) - 1, Number(dm[1]), 12));
    if (!Number.isNaN(d.getTime()) && Number(dm[2]) <= 12 && Number(dm[1]) <= 31) { date = d; years.add(y); }
    t = t.replace(dm[0], ' ');
  }
  for (const m of t.matchAll(/(?<!\d)((?:19|20)\d\d)\s*[/-]\s*(\d{2}|\d{4})(?!\d)/g)) {
    const a = Number(m[1]);
    years.add(a); years.add(a + 1);
    t = t.replace(m[0], ' ');
  }
  for (const m of t.matchAll(/(?<!\d)((?:19[4-9]|20[0-4])\d)(?!\d)/g)) { years.add(Number(m[1])); t = t.replace(m[0], ' '); }
  const scores: Array<[number, number]> = [];
  for (const m of t.matchAll(/(?<![\d:])(\d{1,2})\s*[-–:]\s*(\d{1,2})(?![\d:])/g)) scores.push([Number(m[1]), Number(m[2])]);
  return { scores, date, years: [...years] };
}

export function videoKind(v: VideoInput): VideoKind {
  const t = normalizeHe(v.title);
  return FULL_RE.test(t) || (v.durationSec != null && v.durationSec >= 45 * 60) ? 'full' : 'recap';
}

export function matchVideo(v: VideoInput, games: HbsGame[], now = new Date()): MatchResult {
  const t = normalizeHe(v.title);
  const kind = videoKind(v);
  const none = (why: string, relevant = false): MatchResult => ({ relevant, kind, candidates: [], confidence: 'none', why });
  if (!HBS_RE.test(t)) return none('לא מוזכרת באר שבע בכותרת');
  if (IGNORE_RE.test(t) && !FULL_RE.test(t) && !RECAP_RE.test(t)) return none('לא סרטון משחק (ראיון/שידור/אחר)');
  if (v.durationSec != null && v.durationSec < 60) return none('קצר מדי (Short)');

  const stripped = stripHbs(t).replace(/\s+/g, ' ');
  const facts = titleFacts(v.title);
  const out: GameCandidate[] = [];
  for (const g of games) {
    if (g.dateTime > now || g.homeScore == null || g.awayScore == null) continue;
    const opp = opponentMatch(stripped, g.hbsHome ? g.awayName : g.homeName);
    if (!opp) continue;
    const reasons = [opp === 'full' ? 'שם היריבה' : 'שם היריבה (חלקי)'];
    let points = opp === 'full' ? 3 : 1;
    let anchored = false;

    if (facts.scores.length) {
      const ok = facts.scores.some(([a, b]) => (a === g.homeScore && b === g.awayScore) || (a === g.awayScore && b === g.homeScore));
      if (!ok) continue;
      points += 3; reasons.push('תוצאה'); anchored = true;
    }
    if (facts.date) {
      if (Math.abs(facts.date.getTime() - g.dateTime.getTime()) > 1.5 * DAY) continue;
      points += 5; reasons.push('תאריך בכותרת'); anchored = true;
    } else if (facts.years.length) {
      if (!facts.years.includes(g.dateTime.getUTCFullYear())) continue;
      points += 1; reasons.push('שנה בכותרת');
    }
    const tr = t.match(/מחזור (\d{1,2})|round (\d{1,2})/);
    if (tr && g.round != null && Number(tr[1] ?? tr[2]) === g.round) { points += 2; reasons.push('מחזור'); }
    if (v.publishedAt) {
      const lag = v.publishedAt.getTime() - g.dateTime.getTime();
      if (lag < -3 * 3600_000) continue; // uploaded before the game
      if (lag <= 10 * DAY) { points += 3; reasons.push('הועלה סמוך למשחק'); anchored = true; }
    }
    if (!anchored) continue; // the name alone cannot pick one of dozens of meetings
    out.push({ gameId: g.id, points, reasons });
  }
  out.sort((a, b) => b.points - a.points);
  if (!out.length) return none('לא נמצא משחק תואם', true);

  const [best, second] = out;
  const unique = !second || second.points < best.points;
  const has = (r: string) => best.reasons.includes(r);
  const strongName = has('שם היריבה');
  const dated = has('תאריך בכותרת') || has('הועלה סמוך למשחק');
  const matchVideoish = kind === 'full' || RECAP_RE.test(t);
  let confidence: Confidence = 'none';
  if (unique && strongName && has('תוצאה') && dated && matchVideoish) confidence = 'high';
  else if (unique && best.points >= 6) confidence = 'medium';
  return { relevant: true, kind, candidates: out.slice(0, 5), confidence, why: best.reasons.join(' + ') };
}
