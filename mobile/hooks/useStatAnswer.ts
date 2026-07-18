import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import type { StatAnswerPayload } from '@shared/types/mobile-api';

export function useStatAnswer(id: string | null, clubKey?: string, rivalKey?: string) {
  return useQuery<StatAnswerPayload>({
    queryKey: ['history', 'ask', id, clubKey, rivalKey],
    enabled: !!id,
    queryFn: () => {
      const p = new URLSearchParams({ q: id! });
      if (clubKey) p.set('club', clubKey);
      if (rivalKey) p.set('rival', rivalKey);
      return apiClient.get<StatAnswerPayload>(`/history/ask?${p.toString()}`);
    },
    // History-derived answers change once a season — mirror the server's 1h cache.
    staleTime: 60 * 60_000,
  });
}
