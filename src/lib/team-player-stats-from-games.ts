// src/lib/team-player-stats-from-games.ts — per-player season lines counted from the games
// themselves (lineups + events) rather than from PlayerStatistics, plus WHERE each one
// happened, so a leaderboard entry can list the games behind its number.
//
// PlayerStatistics is an aggregate imported from outside sources and lags the games: on
// the statistics page Ofir Marciano read 1 appearance while the lineups show him starting
// all six Beer Sheva league games. The games are the record, so count from them.

export type TeamStatsGame = {
  lineupEntries: Array<{ playerId: string | null; role: string; teamId: string }>;
  events: Array<{
    type: string;
    playerId: string | null;
    relatedPlayerId: string | null;
    assistPlayerId?: string | null;
    minute?: number | null;
    extraMinute?: number | null;
  }>;
};

export type TeamPlayerTotals = {
  gamesPlayed: number;
  starts: number;
  subbedIn: number;
  subbedOut: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
};

export type StatKey = keyof TeamPlayerTotals;

/** One counted occurrence: which game (index into the input array), when, and context. */
export type StatOccurrence = {
  gameIndex: number;
  minute: number | null;
  extraMinute: number | null;
  /** 'starter' | 'sub' for appearances, 'penalty' | 'goal' for goals. */
  kind?: string;
  /** The other player involved — the assister of a goal, the scorer of an assist. */
  otherPlayerId?: string | null;
};

export type PlayerBreakdown = {
  totals: Map<string, TeamPlayerTotals>;
  occurrences: Map<string, Partial<Record<StatKey, StatOccurrence[]>>>;
};

const empty = (): TeamPlayerTotals => ({
  gamesPlayed: 0, starts: 0, subbedIn: 0, subbedOut: 0,
  goals: 0, assists: 0, yellowCards: 0, redCards: 0,
});

/**
 * @param teamId restrict lineups to one squad, or null for every team in the games.
 * @param resolve maps any player id seen in a game to the key it is counted under, or null
 *   when that player should be ignored (opponents, unlinked rows).
 */
export function playerBreakdownFromGames(
  games: TeamStatsGame[],
  teamId: string | null,
  resolve: (playerId: string) => string | null,
): PlayerBreakdown {
  const totals = new Map<string, TeamPlayerTotals>();
  const occurrences = new Map<string, Partial<Record<StatKey, StatOccurrence[]>>>();
  const record = (id: string, key: StatKey, occ: StatOccurrence) => {
    const t = totals.get(id) ?? empty();
    t[key] += 1;
    totals.set(id, t);
    const o = occurrences.get(id) ?? {};
    (o[key] ??= []).push(occ);
    occurrences.set(id, o);
  };
  const own = (id: string | null | undefined) => (id ? resolve(id) : null);

  games.forEach((game, gameIndex) => {
    const at = (e: { minute?: number | null; extraMinute?: number | null }, extra: Partial<StatOccurrence> = {}) =>
      ({ gameIndex, minute: e.minute ?? null, extraMinute: e.extraMinute ?? null, ...extra });

    // Maps, not counters: every substitution reaches us twice — once as SUBSTITUTION_OUT
    // (playerId off, relatedPlayerId on) and once as SUBSTITUTION_IN (playerId on) from a
    // second source. Counting events would double every bench appearance.
    const started = new Set<string>();
    const cameOn = new Map<string, StatOccurrence>();
    const wentOff = new Map<string, StatOccurrence>();
    // Cards arrive duplicated the same way: Eliel Peretz had two YELLOW_CARD rows at 44' in
    // one game. One player cannot be booked twice in the same minute, so (type, player,
    // minute) identifies a card.
    const cardsSeen = new Set<string>();
    const firstCard = (e: TeamStatsGame['events'][number], id: string) => {
      const key = `${e.type}|${id}|${e.minute ?? ''}|${e.extraMinute ?? ''}`;
      if (cardsSeen.has(key)) return false;
      cardsSeen.add(key);
      return true;
    };

    for (const entry of game.lineupEntries) {
      if (entry.role !== 'STARTER' || (teamId !== null && entry.teamId !== teamId)) continue;
      const id = own(entry.playerId);
      if (id) started.add(id);
    }

    for (const e of game.events) {
      if (e.type === 'SUBSTITUTION_OUT') {
        const off = own(e.playerId); if (off && !wentOff.has(off)) wentOff.set(off, at(e));
        const on = own(e.relatedPlayerId); if (on && !cameOn.has(on)) cameOn.set(on, at(e, { kind: 'sub' }));
      } else if (e.type === 'SUBSTITUTION_IN') {
        const on = own(e.playerId); if (on && !cameOn.has(on)) cameOn.set(on, at(e, { kind: 'sub' }));
        const off = own(e.relatedPlayerId); if (off && !wentOff.has(off)) wentOff.set(off, at(e));
      } else if (e.type === 'GOAL' || e.type === 'PENALTY_GOAL') {
        // The scorer is playerId; relatedPlayerId (or the rarely-filled assistPlayerId) is the
        // assist. Never fall back to relatedPlayerId as the scorer: when playerId is empty the
        // scorer was just not linked, and relatedPlayer is still the assister — true in all 70
        // such goal events (e.g. Kangwa's goal at Víkingur was being credited to Zlatanović).
        const scorerRaw = e.playerId;
        const assistRaw = e.relatedPlayerId ?? e.assistPlayerId;
        const scorer = own(scorerRaw);
        const assister = own(assistRaw);
        if (scorer) {
          record(scorer, 'goals', at(e, {
            kind: e.type === 'PENALTY_GOAL' ? 'penalty' : 'goal',
            otherPlayerId: assistRaw ?? null,
          }));
        }
        if (assister && assister !== scorer) {
          record(assister, 'assists', at(e, { otherPlayerId: scorerRaw ?? null }));
        }
      } else if (e.type === 'YELLOW_CARD') {
        const id = own(e.playerId); if (id && firstCard(e, id)) record(id, 'yellowCards', at(e));
      } else if (e.type === 'RED_CARD' || e.type === 'YELLOW_RED_CARD') {
        const id = own(e.playerId); if (id && firstCard(e, id)) record(id, 'redCards', at(e));
      }
    }

    for (const id of started) {
      record(id, 'starts', { gameIndex, minute: null, extraMinute: null, kind: 'starter' });
      record(id, 'gamesPlayed', { gameIndex, minute: null, extraMinute: null, kind: 'starter' });
    }
    for (const [id, occ] of cameOn) {
      if (started.has(id)) continue;
      record(id, 'subbedIn', occ);
      record(id, 'gamesPlayed', occ);
    }
    for (const [id, occ] of wentOff) record(id, 'subbedOut', occ);
  });

  return { totals, occurrences };
}

/** Totals only — for callers that do not need the per-game breakdown. */
export function teamPlayerTotalsFromGames(
  games: TeamStatsGame[],
  teamId: string,
  resolve: (playerId: string) => string | null,
): Map<string, TeamPlayerTotals> {
  return playerBreakdownFromGames(games, teamId, resolve).totals;
}

/**
 * True when every game carries a real starting XI for the team — the condition for the
 * game-derived counts to be complete. Without it (older seasons, missing lineups) the
 * caller should fall back to PlayerStatistics rather than show zeros.
 */
export function gamesHaveLineupsFor(games: TeamStatsGame[], teamId: string): boolean {
  return games.length > 0 && games.every(
    (g) => g.lineupEntries.filter((e) => e.teamId === teamId && e.role === 'STARTER').length >= 11,
  );
}
