/**
 * Team badge helper — renders a colored initials badge instead of the club
 * crest while real logos are disabled.
 *
 * WHY: App Store guideline 4.1(a) flagged the trademarked club crests in our
 * screenshots/app as unauthorized third-party content. Until we have rights (or
 * a clearance plan), we hide the crests behind SHOW_TEAM_LOGOS and show a neutral
 * initials monogram on a deterministic (non-official) color. Flip the flag back
 * to true to restore real logos in a future build.
 */

/** Master switch for real club crests. false = initials badge everywhere. */
export const SHOW_TEAM_LOGOS = false;

// Common club-name prefixes (Hebrew + Latin) we drop so the initials reflect the
// distinctive CITY part — e.g. "הפועל באר שבע" → "בש", "Maccabi Tel Aviv" → "TA".
const PREFIXES = new Set([
  'הפועל', 'מכבי', 'ביתר', 'עירוני', 'בני', 'הכוח', 'הכח', 'מס', 'אסא', 'אס',
  'איחוד', 'צעירי', 'מועדון', 'ספורט', 'אחי', 'אליצור', 'הראל',
  'hapoel', 'maccabi', 'beitar', 'bnei', 'ironi', 'hakoah', 'fc', 'sc', 'ms', 'as',
]);

const lettersOnly = (w: string) => w.replace(/[^֑-ׇא-תa-zA-Z]/g, '');

/** 1–2 char monogram from a team name (drops generic club prefixes). */
export function teamInitials(name: string | null | undefined): string {
  if (!name) return '?';
  const words = name.trim().split(/\s+/).map(lettersOnly).filter(Boolean);
  if (words.length === 0) return name.trim().slice(0, 2) || '?';
  const core = words.filter((w) => !PREFIXES.has(w.toLowerCase()));
  const pick = core.length ? core : words;
  if (pick.length >= 2) return (pick[0][0] ?? '') + (pick[1][0] ?? '');
  return pick[0].slice(0, 2);
}

/** Deterministic, pleasant (non-official) badge color from the team name. */
export function teamBadgeColor(name: string | null | undefined): string {
  const s = name ?? '';
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return `hsl(${h}, 55%, 42%)`; // mid-sat, readable with white text
}
