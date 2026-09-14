import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import type { SeasonDossierPayload } from '@shared/types/mobile-api';

export function useSeasonDossier(seasonId: string | undefined) {
  return useQuery<SeasonDossierPayload>({
    queryKey: ['seasonDossier', seasonId],
    queryFn: () => apiClient.get<SeasonDossierPayload>(`/club/seasons/${encodeURIComponent(seasonId!)}`),
    enabled: Boolean(seasonId),
    staleTime: 300_000,
  });
}
