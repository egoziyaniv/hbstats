const {
  seasonStartYear,
  normalizeTeamName,
  teamNameScore,
  parseScore,
  resultKind,
  parseScorers,
  competitionTarget,
  roundNumber,
  sourceRef,
} = require('../../../scripts/lib/eyal-archive');

describe('seasonStartYear', () => {
  it('reads the first year, including the double season', () => {
    expect(seasonStartYear('1963-64')).toBe(1963);
    expect(seasonStartYear('1966-68')).toBe(1966);
    expect(seasonStartYear(null)).toBeNull();
  });
});

describe('team names', () => {
  it('irons out the book spelling', () => {
    expect(normalizeTeamName('מכבי פתח-תקוה')).toBe('מכבי פתח תקווה');
    expect(normalizeTeamName('עירוני קרית-שמונה')).toBe('עירוני קריית שמונה');
    expect(normalizeTeamName('מכביתל-אביב')).toBe('מכבי תל אביב');
    expect(normalizeTeamName("הפועל צפת (ליגה א')")).toBe('הפועל צפת');
    expect(normalizeTeamName('מ.ס אשדוד')).toBe(normalizeTeamName('מ.ס. אשדוד'));
  });

  it('scores identical, prefix and partial matches', () => {
    expect(teamNameScore('מכבי פתח-תקוה', 'מכבי פתח תקווה')).toBe(3);
    expect(teamNameScore('בני יהודה תל-אביב', 'בני יהודה')).toBe(2);
    expect(teamNameScore('הפועל תל-אביב', 'הפועל חיפה')).toBe(0);
    expect(teamNameScore('הפועל רמת-השרון', 'הפועל ניר רמת השרון')).toBe(3);
    expect(teamNameScore('צפרירים חולון', 'הפועל צפרירים חולון')).toBe(2);
    expect(teamNameScore('מכבי פתח-תקוה', 'מכבי  פ"ת')).toBe(3);
    expect(teamNameScore('עירוני רמת-השרון', 'הפועל ניר רמת השרון')).toBe(3);
    expect(teamNameScore('הכח-עמידר רמת-גן', 'הכח מכבי עמידר ר"ג')).toBe(3);
    expect(teamNameScore('הפועל אשקלון', 'הפועל מגדל אשקלון')).toBe(0);
  });
});

describe('scores and notes', () => {
  it('reads home:away', () => {
    expect(parseScore('5:4')).toEqual({ home: 5, away: 4 });
    expect(parseScore(null)).toBeNull();
  });

  it('knows a shootout score from a match score', () => {
    expect(resultKind('בפנדלים')).toBe('pens');
    expect(resultKind('בהארכה')).toBe('aet');
    expect(resultKind(null)).toBe('normal');
    expect(resultKind('הפועל באר-שבע - הפועל חיפה 0:0')).toBe('invalid');
  });
});

describe('parseScorers', () => {
  it('carries a bare minute to the previous name, and marks penalties', () => {
    expect(parseScorers('סימון סבן 25, 76, מרדכי ביטון 44 פנדל').goals).toEqual([
      { name: 'סימון סבן', minute: 25, kind: 'goal' },
      { name: 'סימון סבן', minute: 76, kind: 'goal' },
      { name: 'מרדכי ביטון', minute: 44, kind: 'penalty' },
    ]);
  });

  it('expands "2x" and an anonymous own goal', () => {
    const { goals } = parseScorers("מרקוס אברג'יל2x, ברוך כהן, עצמי");
    expect(goals).toEqual([
      { name: "מרקוס אברג'יל", minute: null, kind: 'goal' },
      { name: "מרקוס אברג'יל", minute: null, kind: 'goal' },
      { name: 'ברוך כהן', minute: null, kind: 'goal' },
      { name: null, minute: null, kind: 'own-goal' },
    ]);
  });

  it('a named own goal does not become the next bare minute’s scorer', () => {
    expect(parseScorers('יוסף אלקסלסי עצמי 30, יצחק ניזרי 32, 40').goals).toEqual([
      { name: 'יוסף אלקסלסי', minute: 30, kind: 'own-goal' },
      { name: 'יצחק ניזרי', minute: 32, kind: 'goal' },
      { name: 'יצחק ניזרי', minute: 40, kind: 'goal' },
    ]);
  });

  it('separates shootout takers from goals', () => {
    const r = parseScorers('ג\'קי דקל 117 בפנדלים: שמואל אדמון, אהרון קול-צבר');
    expect(r.goals).toEqual([{ name: "ג'קי דקל", minute: 117, kind: 'goal' }]);
    expect(r.shootout).toEqual(['שמואל אדמון', 'אהרון קול-צבר']);
  });
});

describe('competitionTarget', () => {
  it('maps leagues by level and cups by family', () => {
    expect(competitionTarget({ 'מסגרת': 'משחקי הליגה', 'רמת ליגה': 1 })).toEqual({ ids: ['comp_liga_haal'] });
    expect(competitionTarget({ 'מסגרת': 'משחקי הליגה', 'רמת ליגה': 3 })).toBeNull();
    expect(competitionTarget({ 'מסגרת': 'גביע המדינה 66/67' })).toEqual({ ids: ['comp_state_cup'] });
    expect(competitionTarget({ 'מסגרת': 'ליגת האלופות' })).toEqual({ europe: true });
    expect(competitionTarget({ 'מסגרת': 'משחקי ידידות' })).toEqual({ ids: ['comp_friendlies'] });
    expect(competitionTarget({ 'מסגרת': 'גביע הטוטו ארצית' })).toEqual({ ids: ['comp_hist_toto_artzit'] });
  });

  it('puts a lower league under its historical name', () => {
    expect(competitionTarget({ 'מסגרת': 'משחקי הליגה', 'רמת ליגה': 3, _leagueName: "ליגה ג' הנגב" })).toEqual({ ids: ['comp_hist_liga_gimel'] });
    expect(competitionTarget({ 'מסגרת': 'משחקי הליגה', 'רמת ליגה': 2, _leagueName: "ליגה א' דרום" })).toEqual({ ids: ['comp_hist_liga_alef'] });
    expect(competitionTarget({ 'מסגרת': 'משחקי הליגה', 'רמת ליגה': 2, _leagueName: 'ליגה לאומית' })).toEqual({ ids: ['comp_liga_leumit'] });
  });
});

describe('misc', () => {
  it('round numbers and row refs', () => {
    expect(roundNumber('Round 12')).toBe(12);
    expect(roundNumber('מחזור 7')).toBe(7);
    expect(roundNumber('רבע גמר')).toBeNull();
    expect(sourceRef({ row: 300, 'עמוד בספר': 62 })).toBe('p62-r300');
  });
});
