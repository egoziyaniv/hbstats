import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import type { AdvancedLeaderboardsPayload } from '@shared/types/mobile-api';

export function useAdvancedStats(year?: number | null) {
  const suffix = year != null ? `?year=${year}` : '';
  return useQuery<AdvancedLeaderboardsPayload>({
    queryKey: ['advanced-stats', year ?? 'latest'],
    queryFn: () => apiClient.get<AdvancedLeaderboardsPayload>(`/stats/advanced${suffix}`),
    staleTime: 60_000,
  });
}
