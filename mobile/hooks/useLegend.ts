import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import type { LegendDetail } from '@shared/types/mobile-api';

export function useLegend(id: string) {
  return useQuery<LegendDetail>({
    queryKey: ['legend', id],
    queryFn: () => apiClient.get<LegendDetail>(`/club/legends/${encodeURIComponent(id)}`),
    enabled: !!id,
  });
}
