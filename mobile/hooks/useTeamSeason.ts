import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import type { TeamSeasonPayload } from '@shared/types/mobile-api';

export function useTeamSeason(teamId: string | null | undefined) {
  return useQuery<TeamSeasonPayload>({
    queryKey: ['team-season', teamId],
    queryFn: () => apiClient.get<TeamSeasonPayload>(`/teams/${teamId}/season`),
    staleTime: 5 * 60_000,
    enabled: !!teamId,
  });
}
