import { buildClubCalendar, type CalendarGame } from '@/lib/club-calendar';

const game: CalendarGame = {
  id: 'game-1', dateTime: new Date('2026-07-01T20:30:00+03:00'), updatedAt: new Date('2026-06-01T12:00:00Z'),
  status: 'SCHEDULED', statusShort: 'NS', statusLong: null,
  homeTeam: { nameHe: 'הפועל באר שבע', nameEn: 'HBS' }, awayTeam: { nameHe: 'מכבי חיפה', nameEn: 'Maccabi' },
  competition: { nameHe: 'ליגת העל', nameEn: 'League' }, venueNameHe: 'טרנר', venueNameEn: null,
};
const unfold = (value: string) => value.replace(/\r\n /g, '');

describe('subscribed club calendar', () => {
  it('uses stable IDs, source revisions and UTC times with estimated two-hour duration', () => {
    const text = unfold(buildClubCalendar([game]));
    expect(text).toContain('UID:game-1@statsai.co.il');
    expect(text).toContain('DTSTART:20260701T173000Z');
    expect(text).toContain('DTEND:20260701T193000Z');
    expect(text).toContain('DTSTAMP:20260601T120000Z');
    expect(text).toContain('LAST-MODIFIED:20260601T120000Z');
    expect(text).toContain('STATUS:CONFIRMED');
    expect(unfold(buildClubCalendar([{ ...game, dateTime: new Date('2026-01-01T20:30:00+02:00') }]))).toContain('DTSTART:20260101T183000Z');
  });
  it('escapes Hebrew text and folds UTF-8 without splitting characters or exceeding 75 octets', () => {
    const name = 'עברית 😀'.repeat(30) + ',;\\\r\nEND:VEVENT';
    const text = buildClubCalendar([{ ...game, venueNameHe: name }]);
    for (const line of text.split('\r\n')) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
    expect(unfold(text)).toContain('\\,\\;\\\\\\nEND:VEVENT');
    expect(text).not.toContain('\ufffd');
    expect(unfold(text).match(/^END:VEVENT$/gm)).toHaveLength(1); // Text cannot inject another event terminator
    expect(text.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });
  it.each([{ statusShort: 'PST' }, { statusShort: 'TBD' }, { statusShort: null, statusLong: 'Match Postponed' }, { statusShort: null, statusLong: 'Time To Be Defined' }])('marks uncertain kickoff %j as transparent tentative all-day placeholder', (status) => {
    const text = unfold(buildClubCalendar([{ ...game, ...status }]));
    expect(text).toContain('STATUS:TENTATIVE');
    expect(text).toContain('TRANSP:TRANSPARENT');
    expect(text).toContain('DTSTART;VALUE=DATE:20260701');
    expect(text).not.toContain('DTSTART:');
    expect(text).toContain('מועד לא נקבע');
    expect(text).toContain('UID:game-1@statsai.co.il');
  });
  it('keeps cancellations and makes deterministic output independent of row order', () => {
    const cancelled = { ...game, id: 'cancelled', status: 'CANCELLED' };
    expect(unfold(buildClubCalendar([cancelled]))).toContain('STATUS:CANCELLED');
    expect(buildClubCalendar([game, cancelled])).toBe(buildClubCalendar([cancelled, game]));
  });
});

it('dates uncertain late-night fixtures by Jerusalem day, not UTC day', () => {
  const text = unfold(buildClubCalendar([{ ...game, statusShort: 'PST', dateTime: new Date('2026-07-01T22:00:00Z') }]));
  expect(text).toContain('DTSTART;VALUE=DATE:20260702');
});

it('recognizes provider cancellations even before the normalized status updates', () => {
  expect(unfold(buildClubCalendar([{ ...game, statusShort: 'CANC' }]))).toContain('STATUS:CANCELLED');
});

it.each([
  { statusShort: null, statusLong: null },
  { statusShort: 'UNKNOWN', statusLong: 'Unverified fixture' },
])('does not confirm imported placeholder times with unverifiable metadata %j', (status) => {
  const text = unfold(buildClubCalendar([{ ...game, ...status, dateTime: new Date('2026-07-01T12:00:00Z') }]));
  expect(text).toContain('STATUS:TENTATIVE');
  expect(text).toContain('DTSTART;VALUE=DATE:20260701');
  expect(text).not.toContain('DTSTART:');
});
