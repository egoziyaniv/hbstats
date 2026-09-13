import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SafeUser } from '@shared/types/common';

const REFRESH_KEY = 'hbs_refresh';
const USER_KEY = 'hbs_user';
const GUEST_KEY = 'hbs_guest';

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

// Credentials have one authoritative store. Discard legacy plaintext copies;
// users whose credentials existed only there must sign in again.
async function secureSet(key: string, value: string): Promise<void> {
  await AsyncStorage.removeItem(key);
  await SecureStore.setItemAsync(key, value, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

async function secureGet(key: string): Promise<string | null> {
  await AsyncStorage.removeItem(key);
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function secureDelete(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    // ignore
  }
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export async function storeRefreshToken(token: string): Promise<void> {
  await secureSet(REFRESH_KEY, token);
}

export async function loadRefreshToken(): Promise<string | null> {
  return secureGet(REFRESH_KEY);
}

export async function clearRefreshToken(): Promise<void> {
  await secureDelete(REFRESH_KEY);
  await secureDelete(USER_KEY);
  accessToken = null;
}

export async function storeUser(user: SafeUser): Promise<void> {
  await secureSet(USER_KEY, JSON.stringify(user));
}

// Guest mode: the user chose to browse without an account. Persisted so the
// choice survives app restarts (until they log in or log out).
export async function storeGuest(isGuest: boolean): Promise<void> {
  if (isGuest) await secureSet(GUEST_KEY, '1');
  else await secureDelete(GUEST_KEY);
}

export async function loadGuest(): Promise<boolean> {
  return (await secureGet(GUEST_KEY)) === '1';
}

export async function loadUser(): Promise<SafeUser | null> {
  const raw = await secureGet(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SafeUser;
  } catch {
    return null;
  }
}
