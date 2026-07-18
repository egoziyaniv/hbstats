import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { ReactNode } from 'react';
import { http, HttpResponse } from 'msw';
import { server } from '../../__tests__/msw/server';
import { useStatAnswer } from '../useStatAnswer';

const wrapper = ({ children }: { children: ReactNode }) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client }, children);
};

describe('useStatAnswer', () => {
  test('fetches the card for a given question + club', async () => {
    server.use(
      http.get('http://localhost:8011/api/mobile/v1/history/ask', () =>
        HttpResponse.json({
          card: {
            id: 'club_top_scorer',
            titleHe: 'מלך השערים',
            cardType: 'hero',
            headline: { label: 'ברדה', value: '94', unit: 'שערים' },
            narrative: null,
          },
        })
      )
    );

    const { result } = renderHook(() => useStatAnswer('club_top_scorer', 'api-563'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.card?.headline?.value).toBe('94');
  });
});
