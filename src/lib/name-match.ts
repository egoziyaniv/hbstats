/**
 * Strict person-name matching for merging scraped players into the DB.
 *
 * The previous matchers (duplicated in merge-engine.ts and sport5-merge.ts) were
 * dangerously loose: a shared surname alone, or one name "containing" the other,
 * counted as a match — so at ~20k players (and even within a single team that
 * has two כהן / לוי) they could merge DIFFERENT people's stats together, which
 * silently corrupts both careers (security review M-6).
 *
 * This matcher requires corroboration on BOTH name parts. It still tolerates
 * transliteration variants (≤1 edit per part) and word reordering / name
 * reversal ("יוסי כהן" ⇄ "כהן יוסי"), but never matches on a single shared word.
 * It is intentionally conservative: a missed match creates a (reviewable)
 * duplicate player, whereas a false match destroys data.
 */

export function normalizePersonName(name: string): string {
  return name
    .replace(/&#\d+;/g, '')
    .replace(/&\w+;/g, '')
    .replace(/['"״׳\-.`']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

// Two words are "close" if equal or within a single edit (transliteration), but
// only for words long enough that a 1-edit window isn't most of the word.
function wordsClose(x: string, y: string): boolean {
  if (x === y) return true;
  if (x.length < 3 || y.length < 3) return false;
  return levenshtein(x, y) <= 1;
}

export function playerNamesMatch(a: string, b: string): boolean {
  const na = normalizePersonName(a);
  const nb = normalizePersonName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;

  const pa = na.split(' ').filter(Boolean);
  const pb = nb.split(' ').filter(Boolean);

  // Word-set match: same words in any order (handles name reversal / reordering).
  if (pa.length === pb.length && pa.length > 1) {
    const sa = [...pa].sort().join(' ');
    const sb = [...pb].sort().join(' ');
    if (sa === sb) return true;
  }

  // Require BOTH first and last name to corroborate (each exact or ≤1 edit).
  // This is what blocks "same surname, different first name" false matches.
  if (pa.length >= 2 && pb.length >= 2) {
    const firstClose = wordsClose(pa[0], pb[0]);
    const lastClose = wordsClose(pa[pa.length - 1], pb[pb.length - 1]);
    if (firstClose && lastClose) return true;
  }

  // Whole-string single-edit tolerance (e.g. one missing/extra letter overall),
  // only when the lengths are essentially the same — never a substring match.
  if (Math.abs(na.length - nb.length) <= 1 && levenshtein(na, nb) <= 1) return true;

  return false;
}
