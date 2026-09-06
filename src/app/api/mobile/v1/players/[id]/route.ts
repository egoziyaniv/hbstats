import { NextRequest, NextResponse } from 'next/server';
import { getMobilePlayerPayload } from '@/lib/mobile-details-api';
import prisma from '@/lib/prisma';
import { buildBeerShevaSpell } from '@/lib/beer-sheva-spell';
import type { PlayerPayload, PlayerSeasonStats, PlayerRecentMatch, PlayerCareerEntry } from '@shared/types/mobile-api';
import type { TeamSummary } from '@shared/types/common';

export const dynamic = 'force-dynamic';

// Pulls the Flashscore extras out of Player.additionalInfo. additionalInfo is
// a Json column so we narrow types defensively.
function extractFlashscoreExtras(additionalInfo: unknown): {
  marketValue: string | null;
  contractUntil: string | null;
  career: PlayerCareerEntry[];
} {
  const empty = { marketValue: null, contractUntil: null, career: [] as PlayerCareerEntry[] };
  if (!additionalInfo || typeof additionalInfo !== 'object') return empty;
  const flashscore = (additionalInfo as { flashscore?: unknown }).flashscore;
  if (!flashscore || typeof flashscore !== 'object') return empty;
  const f = flashscore as {
    marketValue?: unknown;
    contractUntil?: unknown;
    career?: unknown;
  };
  const career: PlayerCareerEntry[] = Array.isArray(f.career)
    ? (f.career as Array<Record<string, unknown>>)
        .map((row) => ({
          season: typeof row.season === 'string' ? row.season : '',
          team: typeof row.team === 'string' ? row.team : null,
          competition: typeof row.competition === 'string' ? row.competition : null,
          rating: typeof row.rating === 'number' ? row.rating : null,
          apps: typeof row.apps === 'number' ? row.apps : null,
          goals: typeof row.goals === 'number' ? row.goals : null,
          assists: typeof row.assists === 'number' ? row.assists : null,
          yellow: typeof row.yellow === 'number' ? row.yellow : null,
          red: typeof row.red === 'number' ? row.red : null,
        }))
        .filter((row) => row.season)
    : [];
  return {
    marketValue: typeof f.marketValue === 'string' ? f.marketValue : null,
    contractUntil: typeof f.contractUntil === 'string' ? f.contractUntil : null,
    career,
  };
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  const raw = await getMobilePlayerPayload(id);

  if (!raw) {
    return NextResponse.json({ error: 'Player not found' }, { status: 404 });
  }

  // Small follow-up query: pull birthDate + Flashscore extras that the
  // shared service does not expose. We try the matched player row first,
  // then fall back to its canonical row so loan-season records still get
  // the market value / contract / career stored on the master record.
  const playerRow = await prisma.player.findFirst({
    where: { id: raw.player.id },
    select: { birthDate: true, additionalInfo: true, canonicalPlayerId: true },
  });
  let extras = playerRow ? extractFlashscoreExtras(playerRow.additionalInfo) : { marketValue: null, contractUntil: null, career: [] };
  let birthDate = playerRow?.birthDate ?? null;
  if (!extras.marketValue && !extras.career.length) {
    // Flashscore extras (market value / contract / career) may live on the
    // canonical master OR on any linked season record — not necessarily the
    // matched row. Mirror the web player page: search the whole canonical
    // group and use the first record that has the data.
    const canonicalId = playerRow?.canonicalPlayerId ?? raw.player.id;
    const linked = await prisma.player.findMany({
      where: { OR: [{ id: canonicalId }, { canonicalPlayerId: canonicalId }] },
      select: { birthDate: true, additionalInfo: true },
      // Deterministic + freshest-first: the most recently updated record carries
      // the latest market value / contract, avoiding an arbitrary stale pick.
      orderBy: { updatedAt: 'desc' },
    });
    for (const lp of linked) {
      const e = extractFlashscoreExtras(lp.additionalInfo);
      if (e.marketValue || e.career.length) {
        extras = e;
        if (!birthDate) birthDate = lp.birthDate;
        break;
      }
    }
  }

  // Build player profile
  const playerProfile: PlayerPayload['player'] = {
    id: raw.player.id,
    nameHe: raw.player.name ?? '',
    nameEn: raw.player.nameEn ?? raw.player.name ?? '',
    photoUrl: raw.player.photoUrl ?? null,
    dateOfBirth: birthDate ? birthDate.toISOString().slice(0, 10) : null,
    nationality: raw.sections.profile.nationality ?? null,
    position: raw.player.position ?? null,
    marketValue: extras.marketValue,
    contractUntil: extras.contractUntil,
    aiOverview: (raw.player as any).aiOverview ?? null,
  };

  // Build currentTeam from the player's current team name + season
  const currentTeam: TeamSummary | null = raw.player.teamName
    ? {
        id: raw.player.teamId ?? '',
        apiId: null,
        nameEn: raw.player.teamName,
        nameHe: raw.player.teamName,
        logoUrl: raw.player.teamLogoUrl ?? null,
      }
    : null;

  // Build currentSeasonStats from the first aggregated stat row (latest season).
  // Flashscore's most recent career row is more accurate (it counts goals from
  // the live league source), so when available we prefer it for goals/assists/
  // cards while keeping the DB's appearance/minute counters.
  const firstStat = raw.sections.aggregatedStats?.[0] ?? null;
  const fsTop = extras.career[0] ?? null;

  // Always derive current-season tally from GameEvent + GameLineupEntry rows,
  // so fresh-season players (e.g. Eliel Peretz — goals but no PlayerStatistics
  // yet) show the right numbers. The stored row gets used when the derived
  // count is zero, preserving older seasons that pre-date our event coverage.
  let derivedStats: PlayerSeasonStats | null = null;
  {
    const latestSeason = await prisma.season.findFirst({ orderBy: { year: 'desc' } });
    if (latestSeason) {
      // Each season has its own Player row; events for season N reference
      // that season's row, not the canonical master. Collect all linked IDs
      // (canonical + every record pointing at it) so we count events from
      // the current-season child as well.
      const linkedPlayers = await prisma.player.findMany({
        where: { OR: [{ id: raw.player.id }, { canonicalPlayerId: raw.player.id }] },
        select: { id: true },
      });
      const playerIds = linkedPlayers.map((p) => p.id);
      const idSet = new Set(playerIds);
      const [events, lineups] = await Promise.all([
        prisma.gameEvent.findMany({
          where: {
            game: { seasonId: latestSeason.id, status: { in: ['COMPLETED', 'ONGOING'] } },
            OR: [{ playerId: { in: playerIds } }, { assistPlayerId: { in: playerIds } }],
          },
          select: { type: true, playerId: true, assistPlayerId: true },
        }),
        prisma.gameLineupEntry.findMany({
          where: {
            playerId: { in: playerIds },
            role: { in: ['STARTER', 'SUBSTITUTE'] },
            game: { seasonId: latestSeason.id, status: { in: ['COMPLETED', 'ONGOING'] } },
          },
          select: { gameId: true, role: true },
        }),
      ]);
      const games = new Set(lineups.map((l) => l.gameId));
      const starts = lineups.filter((l) => l.role === 'STARTER').length;
      let goals = 0, assists = 0, yellow = 0, red = 0, subbedIn = 0, subbedOut = 0;
      for (const e of events) {
        if (e.playerId && idSet.has(e.playerId)) {
          if (e.type === 'GOAL' || e.type === 'PENALTY_GOAL') goals += 1;
          else if (e.type === 'ASSIST') assists += 1;
          else if (e.type === 'YELLOW_CARD' || e.type === 'YELLOW_RED_CARD') yellow += 1;
          else if (e.type === 'RED_CARD') red += 1;
          else if (e.type === 'SUBSTITUTION_IN') subbedIn += 1;
          else if (e.type === 'SUBSTITUTION_OUT') subbedOut += 1;
        }
        if (e.assistPlayerId && idSet.has(e.assistPlayerId) && (e.type === 'GOAL' || e.type === 'PENALTY_GOAL')) {
          assists += 1;
        }
      }
      derivedStats = {
        appearances: games.size,
        starts,
        minutes: 0,
        goals,
        assists,
        yellowCards: yellow,
        redCards: red,
        subbedIn,
        subbedOut,
      };
    }
  }

  // Merge stored + derived: prefer the bigger of the two per-field, so we get
  // the latest event-derived counts (Eliel's 8 goals) without losing minutes
  // / appearances that only the stored PlayerStatistics row knows.
  const max = (a: number | null | undefined, b: number | null | undefined) =>
    Math.max(a ?? 0, b ?? 0);
  let currentSeasonStats: PlayerSeasonStats | null = null;
  if (firstStat || fsTop || derivedStats) {
    currentSeasonStats = {
      appearances: max(max(fsTop?.apps, firstStat?.gamesPlayed), derivedStats?.appearances),
      starts: max(firstStat?.starts, derivedStats?.starts),
      minutes: firstStat?.minutesPlayed ?? 0,
      goals: max(max(fsTop?.goals, firstStat?.goals), derivedStats?.goals),
      assists: max(max(fsTop?.assists, firstStat?.assists), derivedStats?.assists),
      yellowCards: max(max(fsTop?.yellow, firstStat?.yellowCards), derivedStats?.yellowCards),
      redCards: max(max(fsTop?.red, firstStat?.redCards), derivedStats?.redCards),
      subbedIn: max(firstStat?.substituteAppearances, derivedStats?.subbedIn),
      subbedOut: max(firstStat?.timesSubbedOff, derivedStats?.subbedOut),
    };
  }

  // Build recentMatches from the last 5 player game rows
  const recentMatches: PlayerRecentMatch[] = (raw.sections.games ?? [])
    .slice(0, 5)
    .map(
      (row: {
        gameId: string;
        matchLabel: string;
        displayDate: string;
        isStarter: boolean;
        wasSubbedIn: boolean;
        wasSubbedOff: boolean;
        goals: number;
        assists: number;
        minutesLabel: string;
      }): PlayerRecentMatch => {
        const role: PlayerRecentMatch['role'] = row.isStarter
          ? 'started'
          : row.wasSubbedIn
          ? 'subbed_in'
          : 'unused';
        const minutes = (() => {
          const parts = row.minutesLabel?.split('-');
          if (parts && parts.length === 2) {
            const start = parseInt(parts[0], 10);
            const end = parseInt(parts[1], 10);
            if (!isNaN(start) && !isNaN(end)) return end - start;
          }
          return 0;
        })();
        return {
          matchId: row.gameId,
          opponent: row.matchLabel,
          date: row.displayDate,
          role,
          contribution: {
            goals: row.goals,
            assists: row.assists,
            minutes,
          },
        };
      }
    );

  const payload: PlayerPayload = {
    player: playerProfile,
    currentTeam,
    currentSeasonStats,
    recentMatches,
    career: extras.career,
    trophies: (raw.sections.trophies as PlayerPayload['trophies']) ?? [],
    songs: (raw.sections.songs as PlayerPayload['songs']) ?? [],
    bsSpell: await buildBeerShevaSpell(playerProfile.id),
  };

  return NextResponse.json(payload);
}
