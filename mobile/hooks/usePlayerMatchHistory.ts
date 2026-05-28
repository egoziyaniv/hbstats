import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import type { PlayerMatchHistoryPayload } from '@shared/types/mobile-api';

export function usePlayerMatchHistory(playerId: string | null) {
  return useQuery<PlayerMatchHistoryPayload>({
    queryKey: ['player-match-history', playerId],
    queryFn: () => apiClient.get<PlayerMatchHistoryPayload>(`/players/${playerId}/match-history`),
    enabled: !!playerId,
    staleTime: 10 * 60_000,
  });
}
