// src/lib/team-player-stats-from-games.ts — a squad's per-player season line, counted from
// the games themselves (lineups + events) rather than from PlayerStatistics.
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

const empty = (): TeamPlayerTotals => ({
  gamesPlayed: 0, starts: 0, subbedIn: 0, subbedOut: 0,
  goals: 0, assists: 0, yellowCards: 0, redCards: 0,
});

/**
 * @param resolve maps any player id seen in a game to the squad row it belongs to, or null
 *   when that player is not in this squad (opponents, unlinked rows).
 */
export function teamPlayerTotalsFromGames(
  games: TeamStatsGame[],
  teamId: string,
  resolve: (playerId: string) => string | null,
): Map<string, TeamPlayerTotals> {
  const totals = new Map<string, TeamPlayerTotals>();
  const bump = (id: string, key: keyof TeamPlayerTotals) => {
    const t = totals.get(id) ?? empty();
    t[key] += 1;
    totals.set(id, t);
  };
  const own = (id: string | null | undefined) => (id ? resolve(id) : null);

  for (const game of games) {
    // Sets, not counters: every substitution reaches us twice — once as SUBSTITUTION_OUT
    // (playerId off, relatedPlayerId on) and once as SUBSTITUTION_IN (playerId on) from a
    // second source. Counting events would double every bench appearance.
    const appeared = new Set<string>();
    const started = new Set<string>();
    const cameOn = new Set<string>();
    const wentOff = new Set<string>();
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
      if (entry.teamId !== teamId || entry.role !== 'STARTER') continue;
      const id = own(entry.playerId);
      if (id) { started.add(id); appeared.add(id); }
    }

    for (const e of game.events) {
      if (e.type === 'SUBSTITUTION_OUT') {
        const off = own(e.playerId); if (off) wentOff.add(off);
        const on = own(e.relatedPlayerId); if (on) cameOn.add(on);
      } else if (e.type === 'SUBSTITUTION_IN') {
        const on = own(e.playerId); if (on) cameOn.add(on);
        const off = own(e.relatedPlayerId); if (off) wentOff.add(off);
      } else if (e.type === 'GOAL' || e.type === 'PENALTY_GOAL') {
        // The scorer is playerId; when only relatedPlayerId is set it IS the scorer.
        // Otherwise relatedPlayerId (or the rarely-filled assistPlayerId) is the assist.
        const scorer = own(e.playerId ?? e.relatedPlayerId);
        if (scorer) bump(scorer, 'goals');
        const assister = own(e.playerId ? (e.relatedPlayerId ?? e.assistPlayerId) : e.assistPlayerId);
        if (assister && assister !== scorer) bump(assister, 'assists');
      } else if (e.type === 'YELLOW_CARD') {
        const id = own(e.playerId); if (id && firstCard(e, id)) bump(id, 'yellowCards');
      } else if (e.type === 'RED_CARD' || e.type === 'YELLOW_RED_CARD') {
        const id = own(e.playerId); if (id && firstCard(e, id)) bump(id, 'redCards');
      }
    }

    for (const id of cameOn) { if (!started.has(id)) { appeared.add(id); bump(id, 'subbedIn'); } }
    for (const id of wentOff) bump(id, 'subbedOut');
    for (const id of started) bump(id, 'starts');
    for (const id of appeared) bump(id, 'gamesPlayed');
  }
  return totals;
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
