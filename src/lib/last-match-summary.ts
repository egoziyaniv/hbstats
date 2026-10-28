// src/lib/last-match-summary.ts — everything the home page shows about a finished game:
// a one-line headline ("ניצחון גדול בחוץ על מוליכת הטבלה"), the goals and red cards in
// kick-off order, a few two-sided numbers, and the player of the match.
//
// matchHeadline() is pure so it can be tested; buildLastMatchSummary() loads one game.
import prisma from '@/lib/prisma';
import { orderedGoals, type SnapGoal, type SnapTeamStat } from '@/lib/team-season-snapshot';

export type MatchMoment = {
  minute: number;
  extraMinute: number | null;
  side: 'home' | 'away';
  kind: 'goal' | 'penalty' | 'own-goal' | 'red-card';
  name: string | null;
};

export type MatchDuel = { label: string; home: number; away: number; unit?: '%' };

export type LastMatchSummary = {
  id: string;
  competitionName: string;
  roundLabel: string | null;
  dateTime: Date;
  home: { id: string; name: string; logoUrl: string | null; score: number };
  away: { id: string; name: string; logoUrl: string | null; score: number };
  /** The side the page is "about" — the followed team, else the winner, else home. */
  focus: 'home' | 'away';
  result: 'W' | 'D' | 'L';
  headline: string;
  moments: MatchMoment[];
  duels: MatchDuel[];
  playerOfMatch: { id: string; name: string; photoUrl: string | null; rating: number; side: 'home' | 'away' | null } | null;
};

export type HeadlineInput = {
  goalsFor: number;
  goalsAgainst: number;
  home: boolean;
  /** League position of the opponent, when the game is a league game. */
  opponentPosition: number | null;
  opponentName: string;
  /** The opponent scored first and we still won. */
  cameFromBehind: boolean;
};

/** "ניצחון גדול בחוץ על מוליכת הטבלה" — said from the focus team's side. */
export function matchHeadline(h: HeadlineInput): string {
  const margin = h.goalsFor - h.goalsAgainst;
  const result =
    margin > 0
      ? h.cameFromBehind ? 'ניצחון מהפך' : margin >= 3 ? 'ניצחון גדול' : 'ניצחון'
      : margin === 0
        ? h.goalsFor === 0 ? 'תיקו מאופס' : 'תיקו'
        : margin <= -3 ? 'הפסד כבד' : 'הפסד';
  const venue = h.home ? 'בבית' : 'בחוץ';
  const against = margin > 0 ? 'על' : 'מול';
  const opponent = h.opponentPosition === 1 ? 'מוליכת הטבלה' : h.opponentName;
  return `${result} ${venue} ${against} ${opponent}`;
}

const FOTMOB_DUELS: Array<{ label: string; key: string }> = [
  { label: 'הזדמנויות גדולות', key: 'Big chances' },
];

function statNumber(v: unknown) {
  const m = String(v ?? '').match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

export async function buildLastMatchSummary(gameId: string, focusTeamIds: string[] = []): Promise<LastMatchSummary | null> {
  const g = await prisma.game.findUnique({
    where: { id: gameId },
    select: {
      id: true, dateTime: true, seasonId: true, competitionId: true,
      homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true, roundNameHe: true,
      competition: { select: { nameHe: true, nameEn: true, type: true } },
      homeTeam: { select: { nameHe: true, nameEn: true, logoUrl: true } },
      awayTeam: { select: { nameHe: true, nameEn: true, logoUrl: true } },
      gameStats: {
        select: {
          homeTeamPossession: true, awayTeamPossession: true, homeShotsTotal: true, awayShotsTotal: true,
          homeShotsOnTarget: true, awayShotsOnTarget: true, homeXg: true, awayXg: true,
        },
      },
      fotmobData: { select: { teamStats: true } },
      events: {
        where: { type: { in: ['GOAL', 'PENALTY_GOAL', 'OWN_GOAL', 'RED_CARD'] } },
        select: {
          type: true, minute: true, extraMinute: true, teamId: true, playerId: true, relatedPlayerId: true,
          participantName: true, player: { select: { nameHe: true, nameEn: true } },
        },
      },
    },
  });
  if (!g || g.homeScore === null || g.awayScore === null) return null;

  const homeScore = g.homeScore;
  const awayScore = g.awayScore;
  const sideOf = (teamId: string | null) => (teamId === g.homeTeamId ? 'home' : teamId === g.awayTeamId ? 'away' : null);
  const nameOf = (e: (typeof g.events)[number]) => e.player?.nameHe || e.player?.nameEn || e.participantName || null;

  const goalEvents = g.events.filter((e) => e.type !== 'RED_CARD');
  const goals = orderedGoals({
    id: g.id, dateTime: g.dateTime, homeTeamId: g.homeTeamId, awayTeamId: g.awayTeamId,
    homeScore, awayScore, competitionId: g.competitionId ?? '', competitionName: '', competitionType: '',
    roundLabel: null, opponentName: '', opponentLogo: null, stats: null, teamStats: null,
    goals: goalEvents.map((e) => ({ type: e.type, minute: e.minute, extraMinute: e.extraMinute, teamId: e.teamId, playerId: e.playerId, relatedPlayerId: e.relatedPlayerId })),
  });
  const eventFor = (s: SnapGoal) =>
    goalEvents.find((e) => e.type === s.type && e.minute === s.minute && e.teamId === s.teamId && e.playerId === s.playerId);

  // Cards are sometimes recorded twice; one per player.
  const seenReds = new Set<string>();
  const reds = g.events
    .filter((e) => e.type === 'RED_CARD' && sideOf(e.teamId))
    .filter((e) => {
      const k = `${e.teamId}|${e.playerId ?? nameOf(e) ?? e.minute}`;
      if (seenReds.has(k)) return false;
      seenReds.add(k);
      return true;
    });

  const moments: MatchMoment[] = [
    ...goals.flatMap((s): MatchMoment[] => {
      const side = sideOf(s.teamId);
      if (!side) return [];
      const ev = eventFor(s);
      const kind = s.type === 'PENALTY_GOAL' ? 'penalty' : s.type === 'OWN_GOAL' ? 'own-goal' : 'goal';
      return [{ minute: s.minute, extraMinute: s.extraMinute, side, kind, name: ev ? nameOf(ev) : null }];
    }),
    ...reds.map((e): MatchMoment => ({ minute: e.minute, extraMinute: e.extraMinute, side: sideOf(e.teamId)!, kind: 'red-card', name: nameOf(e) })),
  ].sort((a, b) => a.minute - b.minute || (a.extraMinute ?? 0) - (b.extraMinute ?? 0));

  const focus: 'home' | 'away' = focusTeamIds.includes(g.awayTeamId)
    ? 'away'
    : focusTeamIds.includes(g.homeTeamId)
      ? 'home'
      : awayScore > homeScore ? 'away' : 'home';
  const gf = focus === 'home' ? homeScore : awayScore;
  const ga = focus === 'home' ? awayScore : homeScore;
  const opponentId = focus === 'home' ? g.awayTeamId : g.homeTeamId;
  const opponent = focus === 'home' ? g.awayTeam : g.homeTeam;
  const opponentName = opponent.nameHe || opponent.nameEn;

  const opponentStanding = g.competition?.type === 'LEAGUE' && g.competitionId
    ? await prisma.standing.findFirst({
        where: { seasonId: g.seasonId, competitionId: g.competitionId, teamId: opponentId },
        select: { position: true },
      })
    : null;
  const firstGoal = moments.find((m) => m.kind !== 'red-card');

  let headline = matchHeadline({
    goalsFor: gf,
    goalsAgainst: ga,
    home: focus === 'home',
    opponentPosition: opponentStanding?.position ?? null,
    opponentName,
    cameFromBehind: gf > ga && !!firstGoal && firstGoal.side !== focus,
  });
  // Nobody followed: say whose result it is.
  if (!focusTeamIds.length) {
    const focusTeam = focus === 'home' ? g.homeTeam : g.awayTeam;
    headline = `${focusTeam.nameHe || focusTeam.nameEn}: ${headline}`;
  }

  const duels: MatchDuel[] = [];
  const s = g.gameStats;
  const push = (label: string, home: number | null | undefined, away: number | null | undefined, unit?: '%') => {
    if (home === null || home === undefined || away === null || away === undefined) return;
    duels.push({ label, home, away, unit });
  };
  push('החזקת כדור', s?.homeTeamPossession, s?.awayTeamPossession, '%');
  push('בעיטות', s?.homeShotsTotal, s?.awayShotsTotal);
  push('למסגרת', s?.homeShotsOnTarget, s?.awayShotsOnTarget);
  const teamStats = Array.isArray(g.fotmobData?.teamStats) ? (g.fotmobData!.teamStats as SnapTeamStat[]) : [];
  for (const d of FOTMOB_DUELS) {
    const row = teamStats.find((r) => r.label === d.key);
    push(d.label, statNumber(row?.home), statNumber(row?.away));
  }
  if (s?.homeXg != null && s?.awayXg != null) push('xG', Math.round(s.homeXg * 10) / 10, Math.round(s.awayXg * 10) / 10);

  const top = await prisma.playerMatchRating.findFirst({
    where: { gameId: g.id, source: 'fotmob' },
    orderBy: { rating: 'desc' },
    select: { rating: true, player: { select: { id: true, nameHe: true, nameEn: true, photoUrl: true, teamId: true } } },
  });

  return {
    id: g.id,
    competitionName: g.competition?.nameHe || g.competition?.nameEn || '',
    roundLabel: g.roundNameHe || null,
    dateTime: g.dateTime,
    home: { id: g.homeTeamId, name: g.homeTeam.nameHe || g.homeTeam.nameEn, logoUrl: g.homeTeam.logoUrl, score: homeScore },
    away: { id: g.awayTeamId, name: g.awayTeam.nameHe || g.awayTeam.nameEn, logoUrl: g.awayTeam.logoUrl, score: awayScore },
    focus,
    result: gf > ga ? 'W' : gf === ga ? 'D' : 'L',
    headline,
    moments,
    duels,
    playerOfMatch: top
      ? {
          id: top.player.id,
          name: top.player.nameHe || top.player.nameEn || '',
          photoUrl: top.player.photoUrl,
          rating: Math.round(top.rating * 10) / 10,
          side: sideOf(top.player.teamId),
        }
      : null,
  };
}
