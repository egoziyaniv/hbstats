import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import type { StatsPayload } from '@shared/types/mobile-api';

export function useStats(year?: number | null) {
  const suffix = year != null ? `?year=${year}` : '';
  return useQuery<StatsPayload>({
    queryKey: ['stats', year ?? 'latest'],
    queryFn: () => apiClient.get<StatsPayload>(`/stats${suffix}`),
    staleTime: 60_000,
  });
}
