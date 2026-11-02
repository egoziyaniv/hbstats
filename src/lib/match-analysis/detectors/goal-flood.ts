import type { ClubGame, Detector, Fact } from '../types';
import { inLeagueEra, leagueCoverageHe, played, seasonHe, teamHe, teamSequences } from '../util';

const FLOOD = 5;

/** 5+ goals in two consecutive home (or away) games — and whether nothing was played between them. */
export const goalFlood: Detector = ({ kind, target, history, league, leagueFrom, clubHe }) => {
  if (kind !== 'POST' || target.gf == null || target.gf < FLOOD) return [];
  const sameSide = (h: ClubGame) => played(h) && h.atHome === target.atHome;
  const prev = [...history].reverse().find(sameSide);
  if (!prev || (prev.gf ?? 0) < FLOOD) return [];
  const adjacent = prev === history[history.length - 1];
  const sideHe = target.atHome ? 'בית' : 'חוץ';
  const facts: Fact[] = [];

  let clubCount = 0;
  const sides = history.filter(sameSide);
  for (let i = 1; i < sides.length; i += 1) if ((sides[i - 1].gf ?? 0) >= FLOOD && (sides[i].gf ?? 0) >= FLOOD) clubCount += 1;
  facts.push({
    key: 'goal-flood', kind, scope: 'club', coverageHe: 'בתולדות המועדון', rarity: 0.6 + 0.3 / (clubCount + 1),
    textHe: `${FLOOD}+ שערים בשני משחקי ${sideHe} רצופים${adjacent ? ', בלי משחק ביניהם' : ''} — ${clubCount === 0 ? `לראשונה בתולדות ${clubHe}` : `בפעם ה-${clubCount + 1} בתולדות ${clubHe}`}`,
    numbers: { threshold: FLOOD, prevGoals: prev.gf ?? 0, goals: target.gf, times: clubCount + 1 },
    evidenceGameIds: [prev.id, target.id],
  });

  if (inLeagueEra(target, leagueFrom) && prev.isLeague) {
    let count = 0;
    let adjacentCount = 0;
    let last = { team: '', year: 0, at: -Infinity };
    teamSequences(league.filter((l) => l.date < prev.date)).forEach((games) => {
      for (let i = 0; i < games.length; i += 1) {
        const a = games[i];
        if (a.home !== target.atHome || a.gf < FLOOD) continue;
        const j = games.findIndex((x, k) => k > i && x.home === target.atHome);
        if (j === -1 || games[j].gf < FLOOD) continue;
        count += 1;
        if (j === i + 1) adjacentCount += 1;
        if (games[j].game.date.getTime() > last.at) last = { team: teamHe(games[j]), year: games[j].game.seasonYear, at: games[j].game.date.getTime() };
      }
    });
    const cov = leagueCoverageHe(leagueFrom!);
    const adjacentPart = adjacent
      ? (adjacentCount === 0 ? '; הראשונה שבה אלה גם שני משחקי ליגה רצופים' : `; רק הפעם ה-${adjacentCount + 1} שבה אלה גם שני משחקי ליגה רצופים`)
      : '';
    facts.push({
      key: 'goal-flood-league', kind, scope: 'league', coverageHe: cov, rarity: 0.7 + 0.3 / (count + 1),
      textHe: `הפעם ה-${count + 1} ${cov} שקבוצה כובשת ${FLOOD}+ בשני משחקי ${sideHe} רצופים${count ? ` (הקודמת: ${last.team} ב-${seasonHe(last.year)})` : ''}${adjacentPart}`,
      numbers: { threshold: FLOOD, times: count + 1, adjacentTimes: adjacentCount + 1 },
      evidenceGameIds: [prev.id, target.id],
    });
  }
  return facts;
};
