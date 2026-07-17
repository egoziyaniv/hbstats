import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { apiClient, ensureAccessToken } from './apiClient';

// Show notifications while the app is foregrounded.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function getProjectId(): string | undefined {
  return (
    (Constants?.expoConfig?.extra as any)?.eas?.projectId ??
    (Constants as any)?.easConfig?.projectId
  );
}

/**
 * Ask for permission and fetch this device's Expo push token.
 * Returns null on the simulator (no APNs) or if permission is denied.
 */
export async function getExpoPushToken(): Promise<string | null> {
  if (!Device.isDevice) return null; // remote push needs a physical device

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      lightColor: '#dc2626',
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  let granted = existing.granted || existing.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
  if (!granted) {
    const req = await Notifications.requestPermissionsAsync();
    granted = req.granted || req.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
  }
  if (!granted) return null;

  try {
    const projectId = getProjectId();
    const resp = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    return resp.data;
  } catch {
    return null;
  }
}

/** Get the token and register it with the backend (auth header injected by apiClient). */
export async function registerForPushNotifications(): Promise<string | null> {
  const token = await getExpoPushToken();
  if (!token) return null;
  try {
    // Make sure a bearer is available first — the register endpoint accepts
    // anonymous posts (200), so without it the device silently binds to
    // userId=null and gets no favorite-team pushes. ensureAccessToken() is a
    // no-op for genuine guests (no refresh token) → they stay anonymous.
    await ensureAccessToken().catch(() => null);
    await apiClient.post('/notifications/register', { token, platform: Platform.OS });
  } catch {
    // non-fatal — we'll retry next launch
  }
  return token;
}

export async function unregisterPush(token: string): Promise<void> {
  try {
    await apiClient.post('/notifications/unregister', { token });
  } catch {
    // ignore
  }
}
