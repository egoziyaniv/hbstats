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

const EUROPE = new Set(['ליגת האלופות', 'הליגה האירופית', 'אינטרטוטו', 'גביע אופ"א', 'גביע מחזיקות גביע']);

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
    if (level === 1) return { ids: ['comp_liga_haal'] };
    if (level === 2) return { ids: ['comp_liga_leumit'] };
    return null;
  }
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
  roundNumber,
  sourceRef,
};
