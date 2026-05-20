import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import type { PredictionsPayload } from '@shared/types/mobile-api';

export function usePredictions() {
  return useQuery<PredictionsPayload>({
    queryKey: ['predictions'],
    queryFn: () => apiClient.get<PredictionsPayload>('/predictions'),
    staleTime: 60_000,
  });
}
