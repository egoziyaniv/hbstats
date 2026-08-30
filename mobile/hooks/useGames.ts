import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import type { GamesPayload } from '@shared/types/mobile-api';

/**
 * Matches list for a season, grouped by round. `competitionId` switches
 * between the league and cups; omit it to let the server pick Ligat Ha'al.
 */
export function useGames(year?: number | null, competitionId?: string | null) {
  const params = new URLSearchParams();
  if (year != null) params.set('year', String(year));
  if (competitionId) params.set('competitionId', competitionId);
  const qs = params.toString();
  return useQuery<GamesPayload>({
    queryKey: ['games', year ?? 'latest', competitionId ?? 'default'],
    queryFn: () => apiClient.get<GamesPayload>(`/games${qs ? `?${qs}` : ''}`),
    staleTime: 60_000,
    // Keep the previous competition/season visible while the new one loads,
    // so switching a chip doesn't flash the loading spinner.
    placeholderData: keepPreviousData,
  });
}
