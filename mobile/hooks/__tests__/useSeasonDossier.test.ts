import React, { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '../../__tests__/msw/server';
import { useSeasonDossier } from '../useSeasonDossier';

describe('useSeasonDossier', () => {
  test('keys and requests the dossier by encoded season id', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    server.use(http.get('http://localhost:8011/api/mobile/v1/club/seasons/season%202026', () => HttpResponse.json({ season: { id: 'season 2026' } })));
    const wrapper = ({ children }: { children: ReactNode }) => React.createElement(QueryClientProvider, { client }, children);
    const { result } = renderHook(() => useSeasonDossier('season 2026'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(client.getQueryCache().find({ queryKey: ['seasonDossier', 'season 2026'] })).toBeDefined();
  });
});
