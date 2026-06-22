import '../global.css';
import { useEffect, useRef } from 'react';
import { I18nManager } from 'react-native';
import * as Notifications from 'expo-notifications';
import { Stack, useRouter, useSegments } from 'expo-router';
import { registerForPushNotifications } from '@/lib/push';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { queryClient, persister, shouldDehydrateQuery } from '@/lib/queryClient';
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

  // Register this device's push token on launch, and again whenever the signed-in
  // user changes so the token re-binds to them (backend upserts by token).
  useEffect(() => {
    registerForPushNotifications();
  }, [user?.id]);

  // Route notification taps to the relevant screen.
  const handledInitial = useRef(false);
  useEffect(() => {
    function route(data: Record<string, unknown> | undefined) {
      if (!data) return;
      if (typeof data.gameId === 'string') router.push(`/games/${data.gameId}` as any);
      else if (typeof data.teamId === 'string') router.push(`/teams/${data.teamId}` as any);
      else if (data.type === 'news') router.push('/news' as any);
    }
    // Cold start: app opened by tapping a notification.
    if (!handledInitial.current) {
      handledInitial.current = true;
      Notifications.getLastNotificationResponseAsync().then((r) =>
        route(r?.notification.request.content.data as Record<string, unknown> | undefined)
      );
    }
    // Warm: tapped while the app was running/backgrounded.
    const sub = Notifications.addNotificationResponseReceivedListener((response) =>
      route(response.notification.request.content.data as Record<string, unknown> | undefined)
    );
    return () => sub.remove();
  }, [router]);

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
        dehydrateOptions: { shouldDehydrateQuery },
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
