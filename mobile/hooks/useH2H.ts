import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import type { FullH2HApiPayload, H2HClubsPayload } from '@shared/types/mobile-api';

export function useH2HClubs() {
  return useQuery<H2HClubsPayload>({
    queryKey: ['history', 'h2h', 'clubs'],
    queryFn: () => apiClient.get<H2HClubsPayload>('/history/h2h'),
    // History changes once a season — mirror the server's 1h cache.
    staleTime: 60 * 60_000,
  });
}

export function useH2H(a?: string, b?: string) {
  return useQuery<FullH2HApiPayload>({
    queryKey: ['history', 'h2h', a, b],
    queryFn: () => apiClient.get<FullH2HApiPayload>(`/history/h2h?a=${encodeURIComponent(a as string)}&b=${encodeURIComponent(b as string)}`),
    enabled: !!a && !!b,
    staleTime: 60 * 60_000,
  });
}
