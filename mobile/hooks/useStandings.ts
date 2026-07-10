import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import type { StandingsPayload } from '@shared/types/mobile-api';

export type StandingsScope = 'all' | 'home' | 'away';

export function useStandings(year?: number | null, scope: StandingsScope = 'all') {
  const params = new URLSearchParams();
  if (year != null) params.set('year', String(year));
  if (scope !== 'all') params.set('scope', scope);
  const qs = params.toString();
  return useQuery<StandingsPayload>({
    queryKey: ['standings', year ?? 'latest', scope],
    queryFn: () => apiClient.get<StandingsPayload>(`/standings${qs ? `?${qs}` : ''}`),
    staleTime: 60_000,
  });
}
