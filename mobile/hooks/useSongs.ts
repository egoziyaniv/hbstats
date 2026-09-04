import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import type { SongsPayload, SongType } from '@shared/types/mobile-api';

export function useSongs(type?: SongType | null) {
  return useQuery<SongsPayload>({
    queryKey: ['songs', type ?? 'all'],
    queryFn: () => apiClient.get<SongsPayload>('/songs' + (type ? `?type=${type}` : '')),
    staleTime: 60_000,
  });
}
