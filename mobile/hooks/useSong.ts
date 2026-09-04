import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import type { SongDetail } from '@shared/types/mobile-api';

export function useSong(slug: string) {
  return useQuery<SongDetail>({
    queryKey: ['song', slug],
    queryFn: () => apiClient.get<SongDetail>(`/songs/${encodeURIComponent(slug)}`),
    staleTime: 60_000,
    enabled: !!slug,
  });
}
