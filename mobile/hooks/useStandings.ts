import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import type { StandingsPayload } from '@shared/types/mobile-api';

export function useStandings(year?: number | null) {
  const suffix = year != null ? `?year=${year}` : '';
  return useQuery<StandingsPayload>({
    queryKey: ['standings', year ?? 'latest'],
    queryFn: () => apiClient.get<StandingsPayload>(`/standings${suffix}`),
    staleTime: 60_000,
  });
}
