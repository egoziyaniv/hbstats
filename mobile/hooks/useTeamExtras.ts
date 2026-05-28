import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import type { TeamExtrasPayload } from '@shared/types/mobile-api';

export function useTeamExtras(teamId: string | null) {
  return useQuery<TeamExtrasPayload>({
    queryKey: ['team-extras', teamId],
    queryFn: () => apiClient.get<TeamExtrasPayload>(`/teams/${teamId}/extras`),
    enabled: !!teamId,
    staleTime: 10 * 60_000,
  });
}
