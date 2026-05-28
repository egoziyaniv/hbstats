import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import type { GamePlayerStatsPayload } from '@shared/types/mobile-api';

export function useGamePlayerStats(gameId: string | null, enabled: boolean) {
  return useQuery<GamePlayerStatsPayload>({
    queryKey: ['game-player-stats', gameId],
    queryFn: () => apiClient.get<GamePlayerStatsPayload>(`/games/${gameId}/player-stats`),
    enabled: !!gameId && enabled,
    staleTime: 5 * 60_000,
  });
}
