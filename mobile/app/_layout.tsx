import '../global.css';
import { useEffect } from 'react';
import { I18nManager } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { queryClient, persister } from '@/lib/queryClient';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { SeasonContext, useSeasonStoreValue } from '@/lib/seasonStore';

// Native RTL on. flex-row auto-flips, rtlRow() returns 'row', tab bar + standings
// read correctly. Note: under native RTL, alignItems 'flex-start' = visual-RIGHT
// and 'flex-end' = visual-LEFT, and start/end margins flip — components must use
// start/end semantics (not hardcoded left/right) for content to anchor right.
if (!I18nManager.isRTL) {
  I18nManager.allowRTL(true);
  I18nManager.forceRTL(true);
}

function AuthGate() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (isLoading) return;
    const inAuthGroup = segments[0] === 'login';
    // The app opens straight to the content for everyone — login is optional.
    // We never force the login screen; we only send a user who just logged in
    // back out of it.
    if (user && inAuthGroup) {
      router.replace('/');
    }
  }, [user, isLoading, segments, router]);

  return null;
}

export default function RootLayout() {
  const seasonState = useSeasonStoreValue();
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 24 * 60 * 60 * 1000,
        buster: 'v1',
      }}
    >
      <ThemeProvider>
        <SeasonContext.Provider value={seasonState}>
          <AuthProvider>
            <AuthGate />
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="login" />
            </Stack>
          </AuthProvider>
        </SeasonContext.Provider>
      </ThemeProvider>
    </PersistQueryClientProvider>
  );
}
