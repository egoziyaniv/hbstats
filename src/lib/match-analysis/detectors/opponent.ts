import type { Detector, Fact } from '../types';
import { played, resultOf, scoreHe, seasonHe } from '../util';

/** The opponent and the ground: first win (ever / in years), biggest-ever win; PRE: the head-to-head record. */
export const opponent: Detector = ({ kind, target, history, clubHe }) => {
  const meetings = history.filter((h) => played(h) && h.opponentKey === target.opponentKey);
  const opp = target.opponentHe;
  const facts: Fact[] = [];

  if (kind === 'PRE') {
    if (!meetings.length) {
      return [{
        key: 'opponent-record', kind, scope: 'club', coverageHe: 'בתולדות המועדון', rarity: 0.65,
        textHe: `מפגש ראשון אי-פעם של ${clubHe} מול ${opp}`, numbers: { meetings: 0 }, evidenceGameIds: [],
      }];
    }
    const w = meetings.filter((m) => resultOf(m) === 'W').length;
    const d = meetings.filter((m) => resultOf(m) === 'D').length;
    const l = meetings.length - w - d;
    const last = meetings[meetings.length - 1];
    facts.push({
      key: 'opponent-record', kind, scope: 'club', coverageHe: 'בתולדות המועדון', rarity: 0.5,
      textHe: `מאזן מול ${opp}: ${w} ניצחונות, ${d} תיקו ו-${l} הפסדים ב-${meetings.length} מפגשים; האחרון: ${scoreHe(last.gf!, last.ga!)} ב-${seasonHe(last.seasonYear)}`,
      numbers: { wins: w, draws: d, losses: l, meetings: meetings.length, lastGf: last.gf!, lastGa: last.ga!, lastSeason: seasonHe(last.seasonYear) },
      evidenceGameIds: meetings.slice(-5).map((m) => m.id),
    });
    if (target.venueKey) {
      const there = history.filter((h) => played(h) && h.venueKey === target.venueKey && h.atHome === target.atHome && h.opponentKey === target.opponentKey);
      if (there.length >= 3 && !target.atHome) {
        const tw = there.filter((m) => resultOf(m) === 'W').length;
        facts.push({
          key: 'venue-record', kind, scope: 'club', coverageHe: 'בתולדות המועדון', rarity: 0.45,
          textHe: `ב${target.venueHe ?? 'מגרש הזה'} מול ${opp}: ${tw} ניצחונות ב-${there.length} ביקורים`,
          numbers: { wins: tw, visits: there.length }, evidenceGameIds: there.slice(-5).map((m) => m.id),
        });
      }
    }
    return facts;
  }

  if (resultOf(target) !== 'W') return [];
  const wins = meetings.filter((m) => resultOf(m) === 'W');
  if (!wins.length && meetings.length >= 3) {
    facts.push({
      key: 'opponent-first-win', kind, scope: 'club', coverageHe: 'בתולדות המועדון', rarity: 0.9,
      textHe: `ניצחון ראשון אי-פעם של ${clubHe} על ${opp}, במפגש ה-${meetings.length + 1}`,
      numbers: { meeting: meetings.length + 1 }, evidenceGameIds: [target.id],
    });
  } else if (wins.length) {
    const lastWin = wins[wins.length - 1];
    if (target.seasonYear - lastWin.seasonYear >= 5) {
      facts.push({
        key: 'opponent-first-win', kind, scope: 'club', coverageHe: 'בתולדות המועדון', rarity: 0.6,
        textHe: `ניצחון ראשון על ${opp} מאז ${seasonHe(lastWin.seasonYear)}`,
        numbers: { since: seasonHe(lastWin.seasonYear) }, evidenceGameIds: [lastWin.id, target.id],
      });
    }
    const margin = target.gf! - target.ga!;
    if (meetings.length >= 5 && wins.every((m) => m.gf! - m.ga! < margin)) {
      facts.push({
        key: 'opponent-biggest-win', kind, scope: 'club', coverageHe: 'בתולדות המועדון', rarity: 0.8,
        textHe: `${scoreHe(target.gf!, target.ga!)} — הניצחון הגדול ביותר אי-פעם של ${clubHe} על ${opp} (${meetings.length + 1} מפגשים)`,
        numbers: { gf: target.gf!, ga: target.ga!, meetings: meetings.length + 1 }, evidenceGameIds: [target.id],
      });
    }
  }
  if (!target.atHome && target.venueKey) {
    const visits = history.filter((h) => played(h) && !h.atHome && h.venueKey === target.venueKey);
    const venueWins = visits.filter((m) => resultOf(m) === 'W');
    const lastVenueWin = venueWins[venueWins.length - 1];
    const place = target.venueHe ?? 'מגרש הזה';
    if (!lastVenueWin && visits.length >= 3) {
      facts.push({
        key: 'venue-first-win', kind, scope: 'club', coverageHe: 'בתולדות המועדון', rarity: 0.75,
        textHe: `ניצחון חוץ ראשון אי-פעם ב${place}, בביקור ה-${visits.length + 1}`,
        numbers: { visit: visits.length + 1 }, evidenceGameIds: [target.id],
      });
    } else if (lastVenueWin && target.seasonYear - lastVenueWin.seasonYear >= 5) {
      facts.push({
        key: 'venue-first-win', kind, scope: 'club', coverageHe: 'בתולדות המועדון', rarity: 0.55,
        textHe: `ניצחון ראשון ב${place} מאז ${seasonHe(lastVenueWin.seasonYear)}`,
        numbers: { since: seasonHe(lastVenueWin.seasonYear) }, evidenceGameIds: [lastVenueWin.id, target.id],
      });
    }
  }
  return facts;
};
