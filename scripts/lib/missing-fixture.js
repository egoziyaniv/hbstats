'use strict';

/**
 * Decide what to do with a league fixture API-Football lists but we have no row for
 * (no game with that apiFootballId). Pure, so the dedupe rules are unit-testable.
 *
 * A game we already hold under another source (IFA import, no apiFootballId yet) must be
 * linked, not duplicated: same season + competition + home + away, kickoff within
 * LINK_WINDOW_MS (placeholder dates sit on the round's date, at most a few days off).
 *
 *   fixture     API-Football /fixtures response item
 *   homeTeamId  our Team.id for the home side in this season, or null
 *   awayTeamId  likewise for the away side
 *   candidates  existing games of this season + competition with the same home/away teams:
 *               [{ id, apiFootballId, dateTime }]
 *   roundNameHe Hebrew round label to store (caller matches the existing rows' format)
 *
 * Returns { action: 'skip', reason } | { action: 'link', gameId, data } | { action: 'create', data }.
 */
const LINK_WINDOW_MS = 14 * 864e5;

function mapGameStatus(s) {
  if (!s) return 'SCHEDULED';
  if (['FT', 'AET', 'PEN'].includes(s)) return 'COMPLETED';
  if (['1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE'].includes(s)) return 'ONGOING';
  if (['CANC', 'ABD', 'AWD', 'WO'].includes(s)) return 'CANCELLED';
  return 'SCHEDULED';
}

function hebrewRoundName(roundNameEn) {
  if (!roundNameEn) return null;
  const m = roundNameEn.match(/^Regular Season\s*-\s*(\d+)$/i);
  return m ? `מחזור ${m[1]}` : roundNameEn;
}

function planMissingFixture({ fixture, homeTeamId, awayTeamId, candidates = [], roundNameHe }) {
  const apiId = fixture?.fixture?.id;
  const kickoff = new Date(fixture?.fixture?.date);
  if (!apiId || Number.isNaN(kickoff.getTime())) return { action: 'skip', reason: 'incomplete fixture' };
  if (!homeTeamId || !awayTeamId) return { action: 'skip', reason: 'team not in our DB for this season' };

  // Rows that already carry an apiFootballId are other fixtures (a playoff rematch can
  // fall within days of the regular-season meeting), never this one.
  const unlinked = candidates.filter((g) => g.apiFootballId == null &&
    Math.abs(new Date(g.dateTime).getTime() - kickoff.getTime()) <= LINK_WINDOW_MS);
  if (unlinked.length > 1) return { action: 'skip', reason: 'ambiguous: several unlinked games with the same teams' };
  if (unlinked.length === 1) {
    // Only attach the id and the confirmed kickoff — the row's other fields came from a
    // richer source and stay as they are.
    return { action: 'link', gameId: unlinked[0].id, data: { apiFootballId: apiId, dateTime: kickoff } };
  }

  const short = fixture.fixture.status?.short || null;
  const status = mapGameStatus(short);
  const finished = status === 'COMPLETED';
  const roundNameEn = fixture.league?.round || null;
  return {
    action: 'create',
    data: {
      apiFootballId: apiId,
      externalRef: String(apiId),
      dateTime: kickoff,
      timestamp: typeof fixture.fixture.timestamp === 'number' ? fixture.fixture.timestamp : null,
      timezone: fixture.fixture.timezone || null,
      status,
      statusShort: short,
      statusLong: fixture.fixture.status?.long || null,
      homeTeamId,
      awayTeamId,
      homeScore: finished ? fixture.goals?.home ?? null : null,
      awayScore: finished ? fixture.goals?.away ?? null : null,
      roundNameEn,
      roundNameHe: roundNameHe || hebrewRoundName(roundNameEn),
      venueNameEn: fixture.fixture.venue?.name || null,
      refereeEn: fixture.fixture.referee || null,
    },
  };
}

module.exports = { planMissingFixture, hebrewRoundName, LINK_WINDOW_MS };
