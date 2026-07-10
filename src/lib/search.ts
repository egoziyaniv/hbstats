import prisma from '@/lib/prisma';
import { formatPlayerName } from '@/lib/player-display';
import type { SearchResultApiItem } from '@shared/types/mobile-api';

export type SearchResultItem = SearchResultApiItem;

/** Name search over teams/players/games/venues (Hebrew + English, 5 per type). */
export async function searchEntities(query: string): Promise<SearchResultItem[]> {
  const [teams, players, games, venues] = await Promise.all([
    prisma.team.findMany({
      where: {
        OR: [
          { nameHe: { contains: query, mode: 'insensitive' } },
          { nameEn: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: 5,
    }),
    prisma.player.findMany({
      where: {
        OR: [
          { nameHe: { contains: query, mode: 'insensitive' } },
          { nameEn: { contains: query, mode: 'insensitive' } },
        ],
      },
      include: { team: true, canonicalPlayer: true },
      take: 5,
    }),
    prisma.game.findMany({
      where: {
        OR: [
          { homeTeam: { nameHe: { contains: query, mode: 'insensitive' } } },
          { homeTeam: { nameEn: { contains: query, mode: 'insensitive' } } },
          { awayTeam: { nameHe: { contains: query, mode: 'insensitive' } } },
          { awayTeam: { nameEn: { contains: query, mode: 'insensitive' } } },
        ],
      },
      include: {
        homeTeam: true,
        awayTeam: true,
      },
      take: 5,
    }),
    prisma.venue.findMany({
      where: {
        OR: [
          { nameHe: { contains: query, mode: 'insensitive' } },
          { nameEn: { contains: query, mode: 'insensitive' } },
          { cityHe: { contains: query, mode: 'insensitive' } },
          { cityEn: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: 5,
    }),
  ]);

  return [
    ...teams.map((team) => ({
      id: team.id,
      type: 'team' as const,
      label: team.nameHe || team.nameEn,
      subtitle: team.nameEn,
      href: `/teams/${team.id}`,
    })),
    ...players.map((player) => ({
      id: player.id,
      type: 'player' as const,
      label: formatPlayerName(player),
      subtitle: player.team?.nameHe || player.team?.nameEn || undefined,
      href: `/players/${player.canonicalPlayerId || player.id}`,
    })),
    ...games.map((game) => ({
      id: game.id,
      type: 'game' as const,
      label: `${game.homeTeam.nameHe || game.homeTeam.nameEn} מול ${game.awayTeam.nameHe || game.awayTeam.nameEn}`,
      subtitle: new Intl.DateTimeFormat('he-IL', { dateStyle: 'medium' }).format(game.dateTime),
      href: `/games/${game.id}`,
    })),
    ...venues.map((venue) => ({
      id: venue.id,
      type: 'venue' as const,
      label: venue.nameHe || venue.nameEn,
      subtitle: venue.cityHe || venue.cityEn || undefined,
      href: `/venues?q=${encodeURIComponent(venue.nameHe || venue.nameEn)}`,
    })),
  ];
}
