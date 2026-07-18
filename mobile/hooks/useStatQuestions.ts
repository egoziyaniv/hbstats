import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import type { StatQuestionsPayload } from '@shared/types/mobile-api';

export function useStatQuestions() {
  return useQuery<StatQuestionsPayload>({
    queryKey: ['history', 'ask', 'questions'],
    queryFn: () => apiClient.get<StatQuestionsPayload>('/history/ask'),
    // Question catalog + club list barely change — mirror the server's 1h cache.
    staleTime: 60 * 60_000,
    placeholderData: keepPreviousData,
  });
}
