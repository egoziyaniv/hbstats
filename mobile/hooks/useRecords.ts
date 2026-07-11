import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import type { RecordsPayload } from '@shared/types/mobile-api';

export function useRecords(cat?: string, club?: string) {
  const params = new URLSearchParams();
  // club mode wins over cat (server ignores cat when club is set)
  if (club) params.set('club', club);
  else if (cat) params.set('cat', cat);
  const qs = params.toString();
  return useQuery<RecordsPayload>({
    queryKey: ['history', 'records', club ?? null, cat ?? null],
    queryFn: () => apiClient.get<RecordsPayload>(`/history/records${qs ? `?${qs}` : ''}`),
    // History changes once a season — mirror the server's 1h cache.
    staleTime: 60 * 60_000,
    // Keep showing the previous rows while the new selection loads, so
    // switching chips doesn't unmount into the loading spinner mid-switch.
    placeholderData: keepPreviousData,
  });
}
