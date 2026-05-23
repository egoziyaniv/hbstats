import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import type { SeasonsPayload } from '@shared/types/mobile-api';

export function useSeasons() {
  return useQuery<SeasonsPayload>({
    queryKey: ['seasons'],
    queryFn: () => apiClient.get<SeasonsPayload>('/seasons'),
    staleTime: 10 * 60_000,
  });
}
