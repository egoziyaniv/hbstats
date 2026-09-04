import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import type { ClubHubPayload } from '@shared/types/mobile-api';

export function useClubHub() {
  return useQuery<ClubHubPayload>({
    queryKey: ['club'],
    queryFn: () => apiClient.get<ClubHubPayload>('/club'),
    staleTime: 300_000,
  });
}
