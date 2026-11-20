import { matchVideo, opponentMatch, normalizeHe, titleFacts, type HbsGame } from '@/lib/videos/match';
import { parseDuration, parseSearchPage, extractJsonVar } from '@/lib/videos/youtube-fetch';

const g = (id: string, iso: string, opp: string, hbsHome: boolean, hs: number, as: number): HbsGame => ({
  id, dateTime: new Date(iso), hbsHome, homeScore: hs, awayScore: as,
  homeName: hbsHome ? 'הפועל באר שבע' : opp, awayName: hbsHome ? opp : 'הפועל באר שבע',
});

const games: HbsGame[] = [
  g('hta-2026', '2026-11-08T18:00:00Z', 'הפועל תל אביב', true, 1, 0),
  g('hta-2025', '2025-03-02T18:00:00Z', 'הפועל תל אביב', false, 2, 2),
  g('mh-2026', '2026-10-25T17:00:00Z', 'מכבי חיפה', false, 1, 0),
  g('hh-2026', '2026-09-20T17:00:00Z', 'הפועל חיפה', true, 3, 1),
  g('mn-cup', '2024-04-24T17:00:00Z', 'מכבי נתניה', false, 3, 2),
  g('mpt', '2026-10-04T17:00:00Z', 'מכבי פתח תקווה', true, 2, 5),
];
const NOW = new Date('2026-11-21T00:00:00Z');

describe('normalizeHe / opponentMatch', () => {
  it('expands abbreviations', () => {
    expect(normalizeHe('הפועל ב"ש נגד מכבי פ"ת')).toContain('באר שבע');
    expect(normalizeHe('מכבי פ״ת')).toContain('פתח תקווה');
  });
  it('does not confuse Hapoel Haifa with Maccabi Haifa', () => {
    expect(opponentMatch(normalizeHe('מכבי חיפה נגד'), 'הפועל חיפה')).toBeNull();
    expect(opponentMatch(normalizeHe('מכבי חיפה נגד'), 'מכבי חיפה')).toBe('full');
    expect(opponentMatch(normalizeHe('נגד חיפה'), 'מכבי חיפה')).toBe('short');
  });
});

describe('titleFacts', () => {
  it('reads date, score and season', () => {
    const f = titleFacts('חצי גמר גביע המדינה: מכבי נתניה - הפועל באר שבע 3-2 24.4.2024');
    expect(f.date?.toISOString().slice(0, 10)).toBe('2024-04-24');
    expect(f.scores).toEqual([[3, 2]]);
    expect(titleFacts('עונת 2023/24 תקציר').years).toEqual(expect.arrayContaining([2023, 2024]));
    expect(titleFacts('עונת 2023/24 תקציר').scores).toEqual([]);
  });
});

describe('matchVideo', () => {
  it('high confidence: name + score + upload date', () => {
    const r = matchVideo({ title: 'שער דרמטי הכריע: הפועל באר שבע נגד הפועל תל אביב 1-0 | תקציר', publishedAt: new Date('2026-11-08T21:30:00Z'), durationSec: 300 }, games, NOW);
    expect(r.candidates[0].gameId).toBe('hta-2026');
    expect(r.confidence).toBe('high');
    expect(r.kind).toBe('recap');
  });
  it('date in the title pins an old game even if uploaded years later', () => {
    const r = matchVideo({ title: 'חצי גמר גביע המדינה: מכבי נתניה - הפועל באר שבע 3-2 24.4.2024', publishedAt: new Date('2026-01-01'), durationSec: 600 }, games, NOW);
    expect(r.candidates[0].gameId).toBe('mn-cup');
    expect(r.confidence).not.toBe('none');
  });
  it('a wrong score rules the game out', () => {
    const r = matchVideo({ title: 'הפועל באר שבע נגד הפועל תל אביב 3-3 תקציר', publishedAt: new Date('2026-11-09'), durationSec: 300 }, games, NOW);
    expect(r.candidates).toHaveLength(0);
  });
  it('ignores press conferences and videos without Beer Sheva', () => {
    expect(matchVideo({ title: 'מסיבת עיתונאים אחרי הפועל באר שבע - מכבי חיפה', publishedAt: null, durationSec: 600 }, games, NOW).relevant).toBe(false);
    expect(matchVideo({ title: 'מכבי חיפה נגד בית"ר 2-0 תקציר', publishedAt: null, durationSec: 600 }, games, NOW).relevant).toBe(false);
  });
  it('long video or "משחק מלא" is a full match', () => {
    const r = matchVideo({ title: 'משחק מלא: מכבי חיפה - הפועל ב"ש', publishedAt: new Date('2026-10-26'), durationSec: 6000 }, games, NOW);
    expect(r.kind).toBe('full');
    expect(r.candidates[0].gameId).toBe('mh-2026');
  });
  it('name only (no score, no date) is not enough', () => {
    const r = matchVideo({ title: 'הפועל באר שבע נגד הפועל תל אביב תקציר', publishedAt: null, durationSec: 300 }, games, NOW);
    expect(r.candidates).toHaveLength(0);
  });
  it('reversed score order still matches', () => {
    const r = matchVideo({ title: 'הפועל באר שבע נגד מכבי פתח תקווה 5-2 תקציר המשחק', publishedAt: new Date('2026-10-05'), durationSec: 400 }, games, NOW);
    expect(r.candidates[0].gameId).toBe('mpt');
  });
});

describe('youtube page parsing', () => {
  it('parses durations', () => {
    expect(parseDuration('12:34')).toBe(754);
    expect(parseDuration('1:02:03')).toBe(3723);
    expect(parseDuration('LIVE')).toBeNull();
  });
  it('extracts video renderers from ytInitialData', () => {
    const data = { contents: { a: [{ videoRenderer: { videoId: 'abcdefghijk', title: { runs: [{ text: 'כותרת "עם" מרכאות' }] }, ownerText: { runs: [{ text: 'ערוץ' }] }, lengthText: { simpleText: '5:00' } } }] } };
    const html = `<script>var ytInitialData = ${JSON.stringify(data)};</script>`;
    expect(extractJsonVar(html, 'ytInitialData')).toEqual(data);
    expect(parseSearchPage(html)).toEqual([{ videoId: 'abcdefghijk', title: 'כותרת "עם" מרכאות', channel: 'ערוץ', durationSec: 300 }]);
  });
});

describe('round signal', () => {
  it('a matching round number breaks a tie', () => {
    const two: HbsGame[] = [
      { ...g('a', '2020-01-01T17:00:00Z', 'מכבי חיפה', true, 1, 1), round: 5 },
      { ...g('b', '2021-01-01T17:00:00Z', 'מכבי חיפה', true, 1, 1), round: 9 },
    ];
    const r = matchVideo({ title: 'מחזור 9 | תקציר: הפועל ב"ש - מכבי חיפה 1-1', publishedAt: null, durationSec: 300 }, two, NOW);
    expect(r.candidates[0].gameId).toBe('b');
    expect(r.confidence).toBe('medium');
  });
});
