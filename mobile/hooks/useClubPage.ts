import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import type { ClubPageDetail } from '@shared/types/mobile-api';

export function useClubPage(slug: string) {
  return useQuery<ClubPageDetail>({
    queryKey: ['clubPage', slug],
    queryFn: () => apiClient.get<ClubPageDetail>(`/club/pages/${encodeURIComponent(slug)}`),
    enabled: !!slug,
  });
}
