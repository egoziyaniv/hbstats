'use strict';
/**
 * Eyal Hatav's "הפועל באר-שבע – כל המשחקים 1950-2020" — reading its rows.
 *
 * Pure helpers shared by scripts/eyal-archive/import.js and the tests: season years,
 * team-name normalisation, the score columns, the scorer strings and the competition
 * a row belongs to. No database access here.
 */

const SOURCE = 'eyal-archive';
const SOURCE_LABEL_HE = 'הארכיון של אייל חטב';

/** "1963-64" → 1963; the double season "1966-68" → 1966. */
function seasonStartYear(label) {
  const m = String(label || '').match(/^(\d{4})/);
  return m ? Number(m[1]) : null;
}

/** Spelling-insensitive form of a club name, for comparing within one season's opponents.
 *  The book writes "פתח-תקוה", "קרית-שמונה", "מ.ס אשדוד", sometimes a level in brackets
 *  ("הפועל צפת (ליגה א')") and the odd typo ("מכביתל-אביב"); we write "פתח תקווה",
 *  "קריית שמונה", "מ.ס. אשדוד". */
function normalizeTeamName(name) {
  return String(name || '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[״”“]/g, '"')
    .replace(/[׳’‘]/g, "'")
    .replace(/מכביתל/g, 'מכבי תל')
    .replace(/ניר רמת/g, 'רמת')
    .replace(/-/g, ' ')
    .replace(/\./g, '')
    .replace(/תקוה/g, 'תקווה')
    .replace(/קרית/g, 'קריית')
    .replace(/\bב'$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const CLUB_PREFIXES = new Set(['הפועל', 'מכבי', 'בית"ר', 'הכח', 'עירוני', 'מס', 'סכ', 'אליצור', 'הכוכב']);

/** How well two club names agree: 3 identical, 2 one is the other plus a city/suffix
 *  ("בני יהודה" / "בני יהודה תל אביב"), 1 they share their two first words, 0 otherwise. */
function teamNameScore(a, b) {
  const x = normalizeTeamName(a);
  const y = normalizeTeamName(b);
  if (!x || !y) return 0;
  if (x === y) return 3;
  const xs = x.split(' ');
  const ys = y.split(' ');
  const [short, long] = xs.length <= ys.length ? [xs, ys] : [ys, xs];
  if (short.every((w, i) => long[i] === w)) return 2;
  // The same name with the club's prefix dropped: "צפרירים חולון" / "הפועל צפרירים חולון".
  const extra = long.slice(0, long.length - short.length);
  if (short.length >= 2 && extra.length && extra.every((w) => CLUB_PREFIXES.has(w)) && short.every((w, i) => long[extra.length + i] === w)) return 2;
  if (xs.length >= 2 && ys.length >= 2 && xs[0] === ys[0] && xs[1] === ys[1]) return 1;
  return 0;
}

/** The book's score column is already home:away ("תוצאה (בית:חוץ)"). */
function parseScore(text) {
  const m = String(text || '').match(/^\s*(\d+)\s*:\s*(\d+)\s*$/);
  return m ? { home: Number(m[1]), away: Number(m[2]) } : null;
}

/** "הערה לתוצאה" → what the score means. With 'pens' the score IS the shootout. */
function resultKind(note) {
  const n = String(note || '').trim();
  if (!n) return 'normal';
  if (n === 'בפנדלים') return 'pens';
  if (n === 'בהארכה') return 'aet';
  if (n === 'טכני') return 'technical';
  if (n === 'טכני ללא נקודות') return 'technical-no-points';
  if (n === 'לא נערך') return 'not-played';
  if (n === 'הופסק') return 'abandoned';
  return 'invalid';
}

/**
 * "משה גורנס 40, חיים כהן 62" → goals. Shapes in the book:
 *   "סימון סבן 25, 76"        — a bare minute belongs to the previous name
 *   "מרקוס אברג'יל2x"          — two goals, minutes unknown
 *   "יהודה סלוק 26 פנדל"       — penalty
 *   "יוסף אלקסלסי עצמי 30"     — own goal by an opponent, credited to this side
 *   "…, עצמי"                  — own goal, scorer and minute unknown
 *   "ג'קי דקל 117 בפנדלים: א, ב" — after "בפנדלים:" come the shootout takers, not goals
 */
function parseScorers(text) {
  const raw = String(text || '').trim();
  if (!raw) return { goals: [], shootout: [] };
  const [play, pens] = raw.split(/\s*בפנדלים\s*:\s*/);
  const goals = [];
  let last = null;
  for (const partRaw of play.split(/\s*,\s*/)) {
    const part = partRaw.trim();
    if (!part) continue;
    const multi = part.match(/^(.*?)\s*(\d+)x$/);
    if (multi) {
      const name = multi[1].trim() || last;
      for (let i = 0; i < Number(multi[2]); i += 1) goals.push({ name, minute: null, kind: 'goal' });
      last = name;
      continue;
    }
    const ownGoal = /עצמי/.test(part);
    const minutes = [...part.matchAll(/(\d+)(\s*פנדל)?/g)].map((m) => ({ minute: Number(m[1]), penalty: Boolean(m[2]) }));
    const nameText = part.replace(/\d+/g, ' ').replace(/פנדל|עצמי/g, ' ').replace(/\s+/g, ' ').trim();
    const name = nameText || (ownGoal ? null : last);
    const kindOf = (penalty) => (ownGoal ? 'own-goal' : penalty ? 'penalty' : 'goal');
    if (minutes.length) {
      for (const m of minutes) goals.push({ name, minute: m.minute, kind: kindOf(m.penalty) });
    } else {
      goals.push({ name, minute: null, kind: kindOf(false) });
    }
    if (nameText && !ownGoal) last = nameText;
  }
  const shootout = pens ? pens.split(/\s*,\s*/).map((s) => s.trim()).filter(Boolean) : [];
  return { goals, shootout };
}

const EUROPE = new Set(['ליגת האלופות', 'הליגה האירופית']);

/**
 * Competitions we held nothing of until the archive: the historical lower leagues (by the
 * name the book gives Beer Sheva's league that season), friendlies, old cups and the
 * European cups of the 1970s-90s. Created by the import's 'history' stage.
 */
const HISTORY_COMPETITIONS = [
  { id: 'comp_hist_liga_alef', nameHe: "ליגה א'", nameEn: 'Liga Alef (historical)', type: 'LEAGUE', league: "ליגה א'" },
  { id: 'comp_hist_liga_bet', nameHe: "ליגה ב'", nameEn: 'Liga Bet (historical)', type: 'LEAGUE', league: "ליגה ב'" },
  { id: 'comp_hist_liga_gimel', nameHe: "ליגה ג'", nameEn: 'Liga Gimel (historical)', type: 'LEAGUE', league: "ליגה ג'" },
  { id: 'comp_hist_liga_artzit', nameHe: 'ליגה ארצית', nameEn: 'Liga Artzit', type: 'LEAGUE', league: 'ליגה ארצית' },
  { id: 'comp_hist_regional', nameHe: 'ליגה אזורית', nameEn: 'Regional League', type: 'LEAGUE', frame: 'ליגה אזורית' },
  { id: 'comp_hist_test_matches', nameHe: 'משחקי מבחן', nameEn: 'Promotion Test Matches', type: 'CUP', frame: 'משחקי המבחן' },
  { id: 'comp_friendlies', nameHe: 'משחקי ידידות', nameEn: 'Friendlies', type: 'CUP', frame: 'משחקי ידידות' },
  { id: 'comp_hist_cup_20', nameHe: "גביע כ' למדינה", nameEn: '20th Anniversary Cup', type: 'CUP', frame: "גביע כ' למדינה" },
  { id: 'comp_hist_cup_25', nameHe: 'גביע כ"ה למדינה', nameEn: '25th Anniversary Cup', type: 'CUP', frame: 'גביע כ"ה למדינה' },
  { id: 'comp_hist_league_cup', nameHe: 'גביע הליגה', nameEn: 'League Cup', type: 'CUP', frame: 'גביע הליגה' },
  { id: 'comp_hist_ifa_cup', nameHe: 'גביע ההתאחדות', nameEn: 'IFA Cup', type: 'CUP', frame: 'גביע ההתאחדות' },
  { id: 'comp_hist_hakoah_cup', nameHe: 'גביע ותיקי הכח', nameEn: 'Hakoah Veterans Cup', type: 'CUP', frame: 'גביע ותיקי הכח' },
  { id: 'comp_hist_capital_tournament', nameHe: 'טורניר הבירה', nameEn: 'Capital Tournament', type: 'CUP', frame: 'טורניר הבירה' },
  { id: 'comp_hist_lilian_cup', nameHe: 'גביע יהודה ליליאן', nameEn: 'Yehuda Lilian Cup', type: 'CUP', frame: 'גביע יהודה ליליאן' },
  { id: 'comp_hist_toto_artzit', nameHe: 'גביע הטוטו ליגה ארצית', nameEn: 'Toto Cup Artzit', type: 'CUP', frame: 'גביע הטוטו ארצית' },
  { id: 'comp_hist_super_cup_alef', nameHe: "אלוף האלופים ליגה א'", nameEn: 'Liga Alef Super Cup', type: 'CUP', frame: "אלוף האלופים א'" },
  { id: 'comp_hist_intertoto', nameHe: 'אינטרטוטו', nameEn: 'Intertoto Cup', type: 'EUROPE', frame: 'אינטרטוטו' },
  { id: 'comp_hist_uefa_cup', nameHe: 'גביע אופ"א', nameEn: 'UEFA Cup', type: 'EUROPE', frame: 'גביע אופ"א' },
  { id: 'comp_hist_cwc', nameHe: 'גביע מחזיקות גביע', nameEn: "Cup Winners' Cup", type: 'EUROPE', frame: 'גביע מחזיקות גביע' },
];
const HISTORY_IDS = new Set(HISTORY_COMPETITIONS.map((c) => c.id));

/** "ליגה ג' הנגב" / "ליגה א' דרום" → "ליגה ג'" / "ליגה א'": the league without its region. */
function leagueBaseName(name) {
  return String(name || '').replace(/\s+(ה?נגב|ה?דרום|ה?צפון|ה?מרכז)$/, '').trim();
}

/**
 * Which of our competitions a row can match:
 *   { ids: [...] }   — exact competition ids
 *   { europe: true } — any competition of type EUROPE
 *   null             — we hold no such competition (friendlies, regional leagues, old cups)
 */
function competitionTarget(row) {
  const f = String(row['מסגרת'] || '').trim();
  if (f === 'משחקי הליגה') {
    const level = row['רמת ליגה'];
    // Beer Sheva's league that season, from the book's season sheet (set on the row by the import).
    const hist = HISTORY_COMPETITIONS.find((c) => c.league && c.league === leagueBaseName(row._leagueName));
    if (level !== 1 && hist) return { ids: [hist.id] };
    if (level === 1) return { ids: ['comp_liga_haal'] };
    if (level === 2) return { ids: ['comp_liga_leumit'] };
    return null;
  }
  const histCup = HISTORY_COMPETITIONS.find((c) => c.frame === f);
  if (histCup) return { ids: [histCup.id] };
  if (f.startsWith('גביע המדינה')) return { ids: ['comp_state_cup'] };
  if (f.startsWith('גביע הטוטו')) return { ids: ['comp_toto_cup_al', 'comp_toto_cup_leumit', 'comp_toto_cup'] };
  if (f.startsWith('אלוף האלופים')) return { ids: ['comp_super_cup'] };
  if (EUROPE.has(f)) return { europe: true };
  return null;
}

/** "12" / "מחזור 12" / "Round 12" → 12; cup rounds ("רבע גמר") → null. */
function roundNumber(label) {
  const m = String(label ?? '').match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

/** "p62-r300": book page + sheet row — stable id for the row and a pointer for a human. */
function sourceRef(row) {
  return `p${row['עמוד בספר'] ?? '?'}-r${row.row}`;
}

module.exports = {
  SOURCE,
  SOURCE_LABEL_HE,
  seasonStartYear,
  normalizeTeamName,
  teamNameScore,
  parseScore,
  resultKind,
  parseScorers,
  competitionTarget,
  HISTORY_COMPETITIONS,
  HISTORY_IDS,
  leagueBaseName,
  roundNumber,
  sourceRef,
};
