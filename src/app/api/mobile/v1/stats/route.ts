import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentSeasonStartYear } from '@/lib/home-live';

export const dynamic = 'force-dynamic';

const CATEGORIES = [
  'TOP_SCORERS',
  'TOP_ASSISTS',
  'TOP_YELLOW_CARDS',
  'TOP_RED_CARDS',
] as const;

const CATEGORY_KEYS: Record<string, string> = {
  TOP_SCORERS: 'topScorers',
  TOP_ASSISTS: 'topAssists',
  TOP_YELLOW_CARDS: 'topYellowCards',
  TOP_RED_CARDS: 'topRedCards',
};

function extractPhotoUrl(additionalInfo: unknown): string | null {
  if (!additionalInfo || typeof additionalInfo !== 'object') return null;
  const info = additionalInfo as Record<string, unknown>;
  const player = info.player;
  if (!player || typeof player !== 'object') return null;
  const photo = (player as Record<string, unknown>).photo;
  return typeof photo === 'string' ? photo : null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const yearParam = searchParams.get('year');
  // Default (no year) to the latest STARTED season — it has real stats. Using
  // the calendar year landed on the not-yet-played future season (empty).
  const currentYear = getCurrentSeasonStartYear();
  const targetYear = yearParam ? parseInt(yearParam, 10) : currentYear;

  // Find the season by year, or fall back to latest
  let season = await prisma.season.findFirst({
    where: { year: targetYear },
  });

  if (!season) {
    season = await prisma.season.findFirst({
      where: { year: { lte: currentYear } },
      orderBy: { year: 'desc' },
    });
  }

  if (!season) {
    return NextResponse.json(
      { error: 'No season found' },
      { status: 404 }
    );
  }

  // Find the Ligat Ha'al competition via leaderboard entries for this season
  const distinctComps = await prisma.competitionLeaderboardEntry.findMany({
    where: { seasonId: season.id },
    select: {
      competitionId: true,
      competition: { select: { id: true, nameHe: true, nameEn: true, type: true } },
    },
    distinct: ['competitionId'],
  });

  const competition =
    distinctComps.find(
      (e) =>
        e.competition?.type === 'LEAGUE' &&
        (e.competition?.nameEn?.toLowerCase().includes('ligat') ||
          e.competition?.nameEn?.toLowerCase().includes('liga'))
    )?.competition ??
    distinctComps.find((e) => e.competition?.type === 'LEAGUE')?.competition ??
    null;

  // Build leaderboard entries for each category
  const competitionFilter = competition ? { competitionId: competition.id } : {};

  const entriesByCategory = await Promise.all(
    CATEGORIES.map((category) =>
      prisma.competitionLeaderboardEntry.findMany({
        where: {
          seasonId: season!.id,
          category,
          ...competitionFilter,
        },
        orderBy: [{ rank: 'asc' }, { value: 'desc' }],
        take: 20,
        // Pull the linked Player so we can prefer their canonical Hebrew name
        // when the stored leaderboard entry was scraped before transliteration
        // ran (entry.playerNameHe often holds the English fallback).
        include: {
          player: { select: { id: true, nameHe: true, nameEn: true, photoUrl: true } },
        },
      })
    )
  );

  // Hebrew-character heuristic: any code point in the U+0590..U+05FF range.
  const HEB_RE = /[֐-׿]/;
  const preferHebrew = (...candidates: Array<string | null | undefined>): string => {
    for (const c of candidates) {
      if (c && HEB_RE.test(c)) return c;
    }
    return candidates.find((c) => !!c) ?? '';
  };

  const categories: Record<string, unknown[]> = {};
  CATEGORIES.forEach((category, index) => {
    const key = CATEGORY_KEYS[category];
    categories[key] = entriesByCategory[index].map((entry) => {
      const playerNameHe = preferHebrew(entry.player?.nameHe, entry.playerNameHe);
      const photoUrl =
        entry.player?.photoUrl ?? extractPhotoUrl(entry.additionalInfo);
      return {
        rank: entry.rank,
        playerId: entry.playerId,
        playerNameHe,
        playerNameEn: entry.player?.nameEn ?? entry.playerNameEn,
        teamNameHe: entry.teamNameHe,
        teamNameEn: entry.teamNameEn,
        value: entry.value,
        gamesPlayed: entry.gamesPlayed,
        photoUrl,
      };
    });
  });

  // Always derive leaderboards from GameEvent — the stored
  // CompetitionLeaderboardEntry rows are snapshots that go stale fast and
  // miss recent matches (e.g. Dan Biton showing 11 goals when he has 15).
  // For each category we count distinct events, then join Player + their
  // appearance count (lineups + scoring sub-ins). Top 20 by count.
  type Card = { playerId: string | null };
  async function deriveLeaderboard(opts: {
    eventTypes: ('GOAL' | 'PENALTY_GOAL' | 'OWN_GOAL' | 'YELLOW_CARD' | 'RED_CARD' | 'YELLOW_RED_CARD' | 'ASSIST')[];
    countAssist?: boolean;
    // If true, OWN_GOAL is excluded from a scorer's tally (it's still in the
    // event stream but doesn't belong on the top-scorers board).
    excludeOwnGoals?: boolean;
  }) {
    const events = await prisma.gameEvent.findMany({
      where: {
        type: { in: opts.eventTypes },
        ...(opts.countAssist ? {} : { playerId: { not: null } }),
        game: {
          seasonId: season!.id,
          ...(competition ? { competitionId: competition.id } : {}),
          status: { in: ['COMPLETED', 'ONGOING'] },
        },
      },
      select: { playerId: true, assistPlayerId: true, type: true },
    });
    const counts = new Map<string, number>();
    for (const e of events) {
      const id = opts.countAssist ? e.assistPlayerId : e.playerId;
      if (!id) continue;
      if (opts.excludeOwnGoals && e.type === 'OWN_GOAL') continue;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    const topIds = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
    if (topIds.length === 0) return [];

    // Pull player + their game count from the league this season.
    const players = await prisma.player.findMany({
      where: { id: { in: topIds.map(([id]) => id) } },
      include: {
        team: { select: { nameHe: true, nameEn: true } },
        lineupEntries: {
          where: {
            game: {
              seasonId: season!.id,
              ...(competition ? { competitionId: competition.id } : {}),
              status: { in: ['COMPLETED', 'ONGOING'] },
            },
            role: { in: ['STARTER', 'SUBSTITUTE'] },
          },
          select: { gameId: true },
        },
      },
    });
    const byId = new Map(players.map((p) => [p.id, p]));
    return topIds.map(([playerId, value], i) => {
      const p = byId.get(playerId);
      // appearances = unique games where the player started or came on
      const gameIds = new Set((p?.lineupEntries ?? []).map((l) => l.gameId));
      return {
        rank: i + 1,
        playerId,
        playerNameHe: preferHebrew(p?.nameHe, p?.nameEn),
        playerNameEn: p?.nameEn ?? null,
        teamNameHe: p?.team?.nameHe ?? null,
        teamNameEn: p?.team?.nameEn ?? null,
        value,
        gamesPlayed: gameIds.size,
        photoUrl: p?.photoUrl ?? null,
      };
    });
  }

  categories.topScorers = await deriveLeaderboard({
    eventTypes: ['GOAL', 'PENALTY_GOAL'], // own goals don't count toward scorer
  });
  categories.topYellowCards = await deriveLeaderboard({
    eventTypes: ['YELLOW_CARD', 'YELLOW_RED_CARD'],
  });
  categories.topRedCards = await deriveLeaderboard({
    eventTypes: ['RED_CARD', 'YELLOW_RED_CARD'],
  });

  // Assists: events only have 74 ASSIST rows (incomplete — most goals lack
  // the assist link). The stored CompetitionLeaderboardEntry rows from the
  // Walla scrape carry the full counts (R. Revivo 10 etc.), so use them and
  // enrich with the player's Hebrew name from the linked Player record.
  // (categories.topAssists may already hold the enriched leaderboard above.)
  if ((categories.topAssists ?? []).length === 0 && competition) {
    const lbEntries = await prisma.competitionLeaderboardEntry.findMany({
      where: { seasonId: season.id, competitionId: competition.id, category: 'TOP_ASSISTS' },
      orderBy: [{ rank: 'asc' }, { value: 'desc' }],
      take: 20,
      include: { player: { select: { id: true, nameHe: true, nameEn: true, photoUrl: true } } },
    });
    categories.topAssists = lbEntries.map((entry, i) => ({
      rank: i + 1,
      playerId: entry.playerId,
      playerNameHe: preferHebrew(entry.player?.nameHe, entry.playerNameHe),
      playerNameEn: entry.player?.nameEn ?? entry.playerNameEn,
      teamNameHe: entry.teamNameHe,
      teamNameEn: entry.teamNameEn,
      value: entry.value,
      gamesPlayed: entry.gamesPlayed,
      photoUrl: entry.player?.photoUrl ?? extractPhotoUrl(entry.additionalInfo),
    }));
  }
  void preferHebrew;

  return NextResponse.json({
    season: { id: season.id, year: season.year, name: season.name },
    competition: competition
      ? { id: competition.id, nameHe: competition.nameHe, nameEn: competition.nameEn }
      : null,
    categories,
  });
}
