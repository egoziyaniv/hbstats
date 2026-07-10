import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import type { AllTimeTablePayload } from '@shared/types/mobile-api';

export type AllTimeScope = AllTimeTablePayload['scope'];

export function useAllTimeTable(scope: AllTimeScope = 'all') {
  const params = new URLSearchParams();
  if (scope !== 'all') params.set('scope', scope);
  const qs = params.toString();
  return useQuery<AllTimeTablePayload>({
    queryKey: ['history', 'all-time', scope],
    queryFn: () => apiClient.get<AllTimeTablePayload>(`/history/all-time${qs ? `?${qs}` : ''}`),
    // History changes once a season — mirror the server's 1h cache.
    staleTime: 60 * 60_000,
    // Keep showing the previous scope's table while the new one loads, so the
    // toggle doesn't unmount into the loading spinner mid-switch.
    placeholderData: keepPreviousData,
  });
}
