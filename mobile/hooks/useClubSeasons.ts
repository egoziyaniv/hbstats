import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import type { ClubSeasonsPayload } from '@shared/types/mobile-api';

export function useClubSeasons() {
  return useQuery<ClubSeasonsPayload>({
    queryKey: ['clubSeasons'],
    queryFn: () => apiClient.get<ClubSeasonsPayload>('/club/seasons'),
    staleTime: 300_000,
  });
}
