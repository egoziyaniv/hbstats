import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import type { SeasonsSpinePayload } from '@shared/types/mobile-api';

export function useSeasonsSpine() {
  return useQuery<SeasonsSpinePayload>({
    queryKey: ['history', 'seasons'],
    queryFn: () => apiClient.get<SeasonsSpinePayload>('/history/seasons'),
    // History changes once a season — mirror the server's 1h cache.
    staleTime: 60 * 60_000,
  });
}
