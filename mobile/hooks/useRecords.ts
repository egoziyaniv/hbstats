import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import type { RecordsPayload } from '@shared/types/mobile-api';

export function useRecords(cat?: string) {
  const params = new URLSearchParams();
  if (cat) params.set('cat', cat);
  const qs = params.toString();
  return useQuery<RecordsPayload>({
    queryKey: ['history', 'records', cat],
    queryFn: () => apiClient.get<RecordsPayload>(`/history/records${qs ? `?${qs}` : ''}`),
    // History changes once a season — mirror the server's 1h cache.
    staleTime: 60 * 60_000,
    // Keep showing the previous category's rows while the new one loads, so
    // switching chips doesn't unmount into the loading spinner mid-switch.
    placeholderData: keepPreviousData,
  });
}
