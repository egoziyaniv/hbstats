import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentSeasonStartYear, getDefaultDisplaySeasonId } from '@/lib/home-live';
import type { GamesPayload, GamesRoundGroup, GamesCompetitionOption } from '@shared/types/mobile-api';
import type { MatchCard, MatchStatus } from '@shared/types/common';

export const dynamic = 'force-dynamic';

const LIGAT_HAAL_ID = 'comp_liga_haal';

/** Map Prisma GameStatus → MatchStatus */
function toMatchStatus(status: string): MatchStatus {
  switch (status) {
    case 'SCHEDULED': return 'scheduled';
    case 'ONGOING':   return 'live';
    case 'COMPLETED': return 'finished';
    case 'CANCELLED': return 'cancelled';
    case 'POSTPONED': return 'postponed';
    default:          return 'scheduled';
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const yearParam = searchParams.get('year');
  const competitionParam = searchParams.get('competitionId');

  // Resolve the season: explicit ?year, else the default display season
  // (newest with real league play — matches the standings screen default).
  let season = null;
  if (yearParam) {
    const y = parseInt(yearParam, 10);
    if (Number.isFinite(y)) season = await prisma.season.findFirst({ where: { year: y } });
  } else {
    const id = await getDefaultDisplaySeasonId();
    season = id
      ? await prisma.season.findUnique({ where: { id } })
      : await prisma.season.findFirst({ where: { year: { lte: getCurrentSeasonStartYear() } }, orderBy: { year: 'desc' } });
  }
  if (!season) {
    const empty: GamesPayload = { season: null, competitions: [], selectedCompetitionId: null, rounds: [] };
    return NextResponse.json(empty);
  }

  // Competitions that actually have games this season (league + cups).
  const competitionsRaw = await prisma.competition.findMany({
    where: { games: { some: { seasonId: season.id } } },
    select: { id: true, nameHe: true, nameEn: true },
    orderBy: [{ nameHe: 'asc' }],
  });
  const competitions: GamesCompetitionOption[] = competitionsRaw.map((c) => ({
    id: c.id,
    nameHe: c.nameHe || c.nameEn || '',
  }));

  // Default competition: Ligat Ha'al when present, else the first available.
  let selectedCompetitionId = competitionParam;
  if (!selectedCompetitionId || !competitions.some((c) => c.id === selectedCompetitionId)) {
    selectedCompetitionId = competitions.some((c) => c.id === LIGAT_HAAL_ID)
      ? LIGAT_HAAL_ID
      : competitions[0]?.id ?? null;
  }

  const games = selectedCompetitionId
    ? await prisma.game.findMany({
        where: { seasonId: season.id, competitionId: selectedCompetitionId },
        select: {
          id: true,
          apiFootballId: true,
          dateTime: true,
          status: true,
          homeScore: true,
          awayScore: true,
          elapsed: true,
          roundNameHe: true,
          roundNameEn: true,
          competitionId: true,
          homeTeam: { select: { id: true, apiFootballId: true, nameEn: true, nameHe: true, logoUrl: true } },
          awayTeam: { select: { id: true, apiFootballId: true, nameEn: true, nameHe: true, logoUrl: true } },
          competition: { select: { nameHe: true, nameEn: true } },
        },
        orderBy: { dateTime: 'asc' },
      })
    : [];

  // Group games by round, preserving chronological order within each round.
  const groupMap = new Map<string, MatchCard[]>();
  for (const g of games) {
    const roundLabel = g.roundNameHe || g.roundNameEn || 'משחקים';
    const card: MatchCard = {
      id: g.id,
      apiId: g.apiFootballId ?? null,
      date: g.dateTime ? g.dateTime.toISOString() : new Date(0).toISOString(),
      status: toMatchStatus(g.status),
      minute: g.elapsed ?? null,
      home: {
        team: {
          id: g.homeTeam.id,
          apiId: g.homeTeam.apiFootballId ?? null,
          nameEn: g.homeTeam.nameEn,
          nameHe: g.homeTeam.nameHe,
          logoUrl: g.homeTeam.logoUrl,
        },
        score: g.homeScore ?? null,
      },
      away: {
        team: {
          id: g.awayTeam.id,
          apiId: g.awayTeam.apiFootballId ?? null,
          nameEn: g.awayTeam.nameEn,
          nameHe: g.awayTeam.nameHe,
          logoUrl: g.awayTeam.logoUrl,
        },
        score: g.awayScore ?? null,
      },
      leagueId: g.competitionId ?? '',
      leagueName: g.competition?.nameHe || g.competition?.nameEn || '',
    };
    if (!groupMap.has(roundLabel)) groupMap.set(roundLabel, []);
    groupMap.get(roundLabel)!.push(card);
  }

  // Order rounds around "now" instead of by date alone. A full season's
  // fixtures are all pre-loaded, so a plain date sort would surface the season
  // finale (round 26 in March) at the top. Anchor to the CURRENT round — the
  // latest round that has already kicked off — then list earlier rounds
  // (recent results, newest first) and finally the upcoming rounds. This keeps
  // today's games at the top of the list all season long.
  const roundEntries = Array.from(groupMap.entries()).map(([roundLabel, roundGames]) => ({
    roundLabel,
    games: roundGames,
    startMs: new Date(roundGames[0].date).getTime(), // earliest kickoff (games are asc)
  }));
  roundEntries.sort((a, b) => a.startMs - b.startMs);

  const nowMs = Date.now();
  let currentIdx = -1;
  for (let i = 0; i < roundEntries.length; i++) {
    if (roundEntries[i].games.some((m) => new Date(m.date).getTime() <= nowMs)) currentIdx = i;
  }
  if (currentIdx === -1) currentIdx = 0; // season hasn't started — lead with the first round

  const ordered: typeof roundEntries = [];
  for (let i = currentIdx; i >= 0; i--) ordered.push(roundEntries[i]);              // current + past (newest first)
  for (let i = currentIdx + 1; i < roundEntries.length; i++) ordered.push(roundEntries[i]); // upcoming (ascending)

  const rounds: GamesRoundGroup[] = ordered.map(({ roundLabel, games: roundGames }) => ({
    roundLabel,
    games: roundGames,
  }));

  const payload: GamesPayload = {
    season: { id: season.id, year: season.year, name: season.name },
    competitions,
    selectedCompetitionId,
    rounds,
  };
  return NextResponse.json(payload);
}
