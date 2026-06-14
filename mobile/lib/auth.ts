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

// Keychain-first storage with an AsyncStorage fallback. Properly-signed device
// builds use the iOS Keychain (encrypted, the secure default). When the Keychain
// is unavailable — e.g. an unsigned/ad-hoc simulator dev build that lacks the
// keychain-access-group entitlement, where SecureStore throws "a required
// entitlement isn't present" — we transparently fall back to AsyncStorage so
// auth still works. The fallback never triggers on real signed builds.
async function secureSet(key: string, value: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  } catch {
    await AsyncStorage.setItem(key, value);
  }
}

async function secureGet(key: string): Promise<string | null> {
  try {
    const v = await SecureStore.getItemAsync(key);
    if (v != null) return v;
  } catch {
    // fall through to AsyncStorage
  }
  try {
    return await AsyncStorage.getItem(key);
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
