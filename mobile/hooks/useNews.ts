import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import type { NewsPayload } from '@shared/types/mobile-api';

export function useNews(limit = 20) {
  return useQuery<NewsPayload>({
    queryKey: ['news', limit],
    queryFn: () => apiClient.get<NewsPayload>(`/news?limit=${limit}`),
    staleTime: 60_000,
  });
}
