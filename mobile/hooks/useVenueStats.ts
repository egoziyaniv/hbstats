import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import type { VenueStatsPayload } from '@shared/types/mobile-api';

export function useVenueStats(id: string) {
  return useQuery<VenueStatsPayload>({
    queryKey: ['venue', id],
    queryFn: () => apiClient.get<VenueStatsPayload>(`/venues/${id}`),
    enabled: !!id,
    staleTime: 300_000,
  });
}
