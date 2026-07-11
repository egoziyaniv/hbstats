import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import type { CupHonorsPayload } from '@shared/types/mobile-api';

export function useCupHonors() {
  return useQuery<CupHonorsPayload>({
    queryKey: ['history', 'cups'],
    queryFn: () => apiClient.get<CupHonorsPayload>('/history/cups'),
    // History changes once a season — mirror the server's 1h cache.
    staleTime: 60 * 60_000,
  });
}
