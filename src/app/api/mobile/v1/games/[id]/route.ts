import { NextResponse } from 'next/server';
import { getMobileGamePayload } from '@/lib/mobile-details-api';
import type { MatchPayload, MatchStatus, MatchEvent, Lineup, LineupPlayer, MatchStats, FotmobData } from '@shared/types/mobile-api';
import type { TeamHeader } from '@shared/types/common';

export const dynamic = 'force-dynamic';

function toMatchStatus(raw: string | null | undefined): MatchStatus {
  switch (raw) {
    case 'ONGOING':
      return 'live';
    case 'COMPLETED':
      return 'finished';
    case 'CANCELLED':
      return 'cancelled';
    default:
      return 'scheduled';
  }
}

/** Map raw DB event type to the public mobile taxonomy. Returns null for
 *  event types that should NOT surface on the mobile timeline (e.g. ASSIST
 *  — the assister is already exposed on the GOAL event via relatedPlayer).
 */
function toMatchEventType(raw: string): MatchEvent['type'] | null {
  switch (raw) {
    case 'GOAL':
    case 'PENALTY_GOAL':
    case 'OWN_GOAL':
      return 'goal';
    case 'YELLOW_CARD':
    case 'YELLOW_RED_CARD':
      return 'yellow';
    case 'RED_CARD':
      return 'red';
    case 'SUBSTITUTION_IN':
    case 'SUBSTITUTION_OUT':
      return 'sub';
    case 'PENALTY_MISSED':
      return 'penalty';
    case 'ASSIST':
      return null;  // redundant — assister already on the GOAL row
    default:
      return null;  // skip unknown to avoid mis-rendering as ⚽
  }
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const { id } = params;
  const raw = await getMobileGamePayload(id);

  if (!raw) {
    return NextResponse.json({ error: 'Game not found' }, { status: 404 });
  }

  const game = raw.game;

  // Build TeamHeader for home and away teams
  const homeTeam: TeamHeader = {
    id: game.homeTeam.id,
    apiId: null,
    nameEn: game.homeTeam.name,
    nameHe: game.homeTeam.name,
    logoUrl: game.homeTeam.logoUrl ?? null,
    founded: null,
    venueName: null,
    city: null,
    aiSummaryText: null,
    wikiSummary: null,
    wikiThumbnail: null,
    wikiSourceUrl: null,
  };

  const awayTeam: TeamHeader = {
    id: game.awayTeam.id,
    apiId: null,
    nameEn: game.awayTeam.name,
    nameHe: game.awayTeam.name,
    logoUrl: game.awayTeam.logoUrl ?? null,
    founded: null,
    venueName: null,
    city: null,
    aiSummaryText: null,
    wikiSummary: null,
    wikiThumbnail: null,
    wikiSourceUrl: null,
  };

  // Build events array. Drop events whose type doesn't render on mobile
  // (ASSIST, anything unrecognised) instead of letting them appear as ⚽.
  const events: MatchEvent[] = raw.sections.events
    .map((event) => {
      const mappedType = toMatchEventType(event.type);
      if (!mappedType) return null;
      const teamSide: 'home' | 'away' =
        event.teamId === game.homeTeam.id ? 'home' : 'away';
      return {
        id: event.id,
        minute: event.minute,
        type: mappedType,
        player: event.playerName ?? null,
        team: teamSide,
        assistPlayer: event.relatedPlayerName ?? null,
      };
    })
    .filter((e): e is MatchEvent => e !== null);

  // Build lineups
  function buildLineup(side: 'home' | 'away'): Lineup {
    const rawLineup = raw!.sections.lineups[side];
    const players: LineupPlayer[] = [
      ...rawLineup.starters.map((p) => ({
        player: {
          id: p.id,
          apiId: null,
          nameEn: p.displayName,
          nameHe: p.displayName,
          photoUrl: null,
          position: p.positionName ?? null,
          jerseyNumber: p.jerseyNumber ?? null,
        },
        isStarting: true,
        position: p.positionName ?? null,
        rating: p.rating ?? null,
      })),
      ...rawLineup.substitutes.map((p) => ({
        player: {
          id: p.id,
          apiId: null,
          nameEn: p.displayName,
          nameHe: p.displayName,
          photoUrl: null,
          position: p.positionName ?? null,
          jerseyNumber: p.jerseyNumber ?? null,
        },
        isStarting: false,
        position: p.positionName ?? null,
        rating: p.rating ?? null,
      })),
    ];
    const coach = rawLineup.coachName
      ? {
          id: rawLineup.coachId ?? null,
          name: rawLineup.coachName,
          nameHe: rawLineup.coachNameHe ?? null,
          photoUrl: rawLineup.coachPhotoUrl ?? null,
        }
      : null;
    return {
      formation: rawLineup.formation ?? null,
      players,
      coach,
    };
  }

  // Build matchStats from game statistics rows
  const statsRows = raw.sections.stats as Array<{
    label: string;
    homeValue: number | null;
    awayValue: number | null;
  }>;

  function findStat(label: string) {
    return statsRows.find((row) => row.label === label) ?? null;
  }

  const possessionRow = findStat('אחזקת כדור');
  const shotsOnTargetRow = findStat('בעיטות למסגרת');
  const shotsRow = findStat('בעיטות');
  const cornersRow = findStat('קרנות');
  const foulsRow = findStat('עבירות');
  const yellowsRow = findStat('צהובים');
  const redsRow = findStat('אדומים');
  const offsidesRow = findStat('נבדלים');
  const xgRow = findStat('xG (שערים צפויים)');

  const allRows = [possessionRow, shotsOnTargetRow, shotsRow, cornersRow, foulsRow, yellowsRow, redsRow, offsidesRow, xgRow];
  const hasAnyStats = allRows.some((row) => row && (row.homeValue !== null || row.awayValue !== null));

  const pair = (row: typeof possessionRow) =>
    row && (row.homeValue !== null || row.awayValue !== null)
      ? { home: row.homeValue ?? 0, away: row.awayValue ?? 0 }
      : null;

  const matchStats: MatchStats | null = hasAnyStats
    ? {
        possession: pair(possessionRow),
        shots: pair(shotsRow),
        shotsOnTarget: pair(shotsOnTargetRow),
        corners: pair(cornersRow),
        fouls: pair(foulsRow),
        yellowCards: pair(yellowsRow),
        redCards: pair(redsRow),
        offsides: pair(offsidesRow),
        xg: pair(xgRow),
      }
    : null;

  const info = raw.game.additionalInfo as { awarded?: { winnerTeamId: string; noteHe?: string } } | null;
  const awarded = info?.awarded
    ? { winnerTeamId: info.awarded.winnerTeamId, noteHe: info.awarded.noteHe ?? 'תוצאה טכנית' }
    : null;
  // For awarded games, raw event-summary scores are 0-0 (no on-field goals);
  // use the stored final score instead so the badge + result stay consistent.
  const scoreHome = awarded ? raw.game.homeScore : raw.sections.eventSummary.homeGoals ?? null;
  const scoreAway = awarded ? raw.game.awayScore : raw.sections.eventSummary.awayGoals ?? null;

  const payload: MatchPayload = {
    match: {
      id: game.id,
      status: toMatchStatus(game.status),
      minute: null,
      score: { home: scoreHome, away: scoreAway },
      halfTime: null,
      dates: {
        kickoff: game.dateTime,
        finished: null,
      },
      venue: null,
      referee: null,
      awarded,
    },
    homeTeam,
    awayTeam,
    events,
    lineups: {
      home: buildLineup('home'),
      away: buildLineup('away'),
    },
    matchStats,
    sofascoreStats: (raw.sections.sofascoreStats ?? []).map((s) => ({
      section: s.section,
      label: s.label,
      home: s.home,
      away: s.away,
      homeExtra: s.homeExtra ?? null,
      awayExtra: s.awayExtra ?? null,
    })),
    fotmob: ((raw.sections as { fotmob?: FotmobData | null }).fotmob ?? null),
    sofascoreShotmap: ((raw.sections as { sofascoreShotmap?: MatchPayload['sofascoreShotmap'] }).sofascoreShotmap ?? []),
    h2h: await buildH2HBlock(raw.game.homeTeam.id, raw.game.awayTeam.id, raw.game.id),
    predicted: await buildPredictedBlock(raw),
    preview: await buildPreviewBlock(raw),
  };

  return NextResponse.json(payload);
}

/** Pre-match ("לקראת המשחק") block — recent form + injuries/suspensions + AI
 *  summary. Only for not-yet-started matches; mirrors the web game page. */
async function buildPreviewBlock(
  raw: NonNullable<Awaited<ReturnType<typeof import('@/lib/mobile-details-api').getMobileGamePayload>>>,
): Promise<import('@shared/types/mobile-api').MatchPreviewApi | null> {
  if (raw.game.status !== 'SCHEDULED') return null;
  const prisma = (await import('@/lib/prisma')).default;
  const g = await prisma.game.findUnique({
    where: { id: raw.game.id },
    select: {
      id: true,
      seasonId: true,
      dateTime: true,
      homeTeamId: true,
      awayTeamId: true,
      homeTeam: { select: { nameHe: true, nameEn: true } },
      awayTeam: { select: { nameHe: true, nameEn: true } },
      competition: { select: { nameHe: true, nameEn: true } },
    },
  });
  if (!g) return null;
  const { buildMatchPreview } = await import('@/lib/match-preview');
  return buildMatchPreview(g);
}

async function buildPredictedBlock(raw: NonNullable<Awaited<ReturnType<typeof import('@/lib/mobile-details-api').getMobileGamePayload>>>) {
  // Only predict for not-yet-started matches without known lineups.
  if (raw.game.status !== 'SCHEDULED') return null;
  const homeStarters = raw.sections.lineups.home.starters.length;
  const awayStarters = raw.sections.lineups.away.starters.length;
  if (homeStarters > 0 || awayStarters > 0) return null;
  const { buildPredictedLineup } = await import('@/lib/predicted-lineup');
  const kickoff = new Date(raw.game.dateTime);
  const [home, away] = await Promise.all([
    buildPredictedLineup(raw.game.homeTeam.id, kickoff, 5, '4-4-2'),
    buildPredictedLineup(raw.game.awayTeam.id, kickoff, 5, '4-4-2'),
  ]);
  return { home, away };
}

async function buildH2HBlock(homeTeamId: string, awayTeamId: string, currentGameId: string): Promise<import('@shared/types/mobile-api').H2H | null> {
  const { buildH2H } = await import('@/lib/h2h');
  const summary = await buildH2H(homeTeamId, awayTeamId, 6);
  if (!summary || summary.totalGames === 0) return null;
  // Drop the current game from the meetings list before slicing the last 5.
  const meetings = summary.meetings.filter((m) => m.gameId !== currentGameId).slice(0, 5);
  return {
    lastN: meetings.map((m) => ({
      id: m.gameId,
      apiId: null,
      date: m.date,
      status: 'finished' as const,
      minute: null,
      home: { team: { id: '', apiId: null, nameEn: m.homeTeamName, nameHe: m.homeTeamName, logoUrl: null }, score: m.homeScore },
      away: { team: { id: '', apiId: null, nameEn: m.awayTeamName, nameHe: m.awayTeamName, logoUrl: null }, score: m.awayScore },
      leagueId: '',
      leagueName: m.competitionNameHe || '',
    })),
    wins: { home: summary.winsA, away: summary.winsB, draw: summary.draws },
  };
}
