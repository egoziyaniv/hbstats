/** RFC 5545 serialization. UTC instants let calendar clients apply their own DST rules. */
export const CLUB_CALENDAR_URL = 'https://statsai.co.il/api/calendar/hapoel-beer-sheva.ics';

type Name = { nameHe: string; nameEn: string };
export type CalendarGame = {
  id: string;
  dateTime: Date;
  updatedAt: Date;
  status: string;
  statusShort: string | null;
  statusLong: string | null;
  homeTeam: Name;
  awayTeam: Name;
  competition: Name | null;
  venueNameHe: string | null;
  venueNameEn: string | null;
};

function escapeText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '');
}

function foldLine(value: string): string {
  let output = '';
  let bytes = 0;
  for (const character of value) {
    const size = Buffer.byteLength(character, 'utf8');
    if (bytes + size > 75) { output += '\r\n '; bytes = 1; }
    output += character;
    bytes += size;
  }
  return output;
}

function utc(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function localDate(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  return ['year', 'month', 'day'].map((type) => parts.find((part) => part.type === type)!.value).join('');
}

export function buildClubCalendar(games: CalendarGame[]): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//StatsAI//Hapoel Beer Sheva//HE', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:הפועל באר שבע — StatsAI', 'X-WR-TIMEZONE:Asia/Jerusalem', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H'];
  for (const game of [...games].sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime() || a.id.localeCompare(b.id, 'en'))) {
    const status = `${game.statusShort ?? ''} ${game.statusLong ?? ''}`;
    const cancelled = game.status === 'CANCELLED' || /\b(CANC|cancelled|canceled|ABD|abandoned)\b/i.test(status);
    const verifiedStatus = /^(NS|1H|HT|2H|ET|BT|P|FT|AET|PEN|LIVE|AWD|WO)$/i.test(game.statusShort?.trim() ?? '');
    const uncertain = !cancelled && (!verifiedStatus || /\b(PST|TBD|SUSP|INT|postponed|suspended|interrupted|time to be defined|to be determined)\b|נדחה|טרם נקבע/i.test(status));
    const title = `${game.homeTeam.nameHe || game.homeTeam.nameEn} — ${game.awayTeam.nameHe || game.awayTeam.nameEn}`;
    const note = uncertain
      ? 'מועד לא נקבע. התאריך המוצג הוא מציין מקום לפי המועד האחרון במערכת ואינו מועד משחק מאושר.'
      : cancelled ? 'המשחק בוטל.' : 'משך האירוע המשוער הוא שעתיים. שעת המשחק עשויה להשתנות.';
    const description = `${game.competition?.nameHe || game.competition?.nameEn || ''}\n${note}\nפרטים ועדכונים באתר StatsAI.`;
    lines.push('BEGIN:VEVENT', `UID:${encodeURIComponent(game.id)}@statsai.co.il`, `DTSTAMP:${utc(game.updatedAt)}`, `LAST-MODIFIED:${utc(game.updatedAt)}`);
    if (uncertain) {
      // Preserve the UID without advertising the stale kickoff as a confirmed instant.
      lines.push(`DTSTART;VALUE=DATE:${localDate(game.dateTime)}`, 'DURATION:P1D');
    } else {
      lines.push(`DTSTART:${utc(game.dateTime)}`, `DTEND:${utc(new Date(game.dateTime.getTime() + 2 * 60 * 60 * 1000))}`);
    }
    lines.push(`STATUS:${cancelled ? 'CANCELLED' : uncertain ? 'TENTATIVE' : 'CONFIRMED'}`, `TRANSP:${cancelled || uncertain ? 'TRANSPARENT' : 'OPAQUE'}`, `SUMMARY:${escapeText(`${cancelled ? '[בוטל] ' : uncertain ? '[מועד לא נקבע] ' : ''}${title}`)}`, `DESCRIPTION:${escapeText(description)}`, `LOCATION:${escapeText(game.venueNameHe || game.venueNameEn || '')}`, `URL:https://statsai.co.il/games/${encodeURIComponent(game.id)}`, 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
