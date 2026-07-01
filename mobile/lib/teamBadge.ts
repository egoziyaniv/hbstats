/**
 * Team badge helper — renders a colored initials badge instead of the club
 * crest when real logos are disabled.
 *
 * WHY (platform-specific): App Store guideline 4.1(a) flagged trademarked club
 * crests as unauthorized third-party content, so **iOS ships initials badges**
 * to stay approved (any future iOS update is re-reviewed — flipping this on for
 * iOS would re-trigger the rejection). **Android ships the real club logos**
 * (Google Play's impersonation policy is more lenient). Hence the flag is gated
 * on Platform.OS rather than a single global boolean.
 */
import { Platform } from 'react-native';

/** Real club crests: ON for Android, OFF (initials badge) for iOS. */
export const SHOW_TEAM_LOGOS = Platform.OS === 'android';

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
