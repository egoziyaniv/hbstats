import { QueryClient, type Query } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
      gcTime: 24 * 60 * 60 * 1000, // keep 24 hours
    },
  },
});

export const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'hbs-react-query-cache',
  throttleTime: 1000,
});

// Query-key roots that hold per-user data. These must never be written to the
// on-disk persisted cache (would leak one user's data to the next / to a guest)
// and are cleared on login/logout.
export const USER_QUERY_KEYS = ['preferences', 'home'];

function isUserQuery(query: Query): boolean {
  return USER_QUERY_KEYS.includes(String(query.queryKey?.[0]));
}

// Persist only successful, non-user-specific queries (public data is safe to
// cache offline; account/personalized data is not).
export function shouldDehydrateQuery(query: Query): boolean {
  return query.state.status === 'success' && !isUserQuery(query);
}

// Drop any cached per-user data — called on login (new identity) and logout.
export function clearUserQueries() {
  for (const key of USER_QUERY_KEYS) {
    queryClient.removeQueries({ queryKey: [key] });
  }
}
