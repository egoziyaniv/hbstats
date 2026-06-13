import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { apiClient } from '@/lib/apiClient';
import { getGoogleIdToken } from '@/lib/googleAuth';
import {
  setAccessToken,
  storeRefreshToken,
  loadRefreshToken,
  storeUser,
  loadUser,
  clearRefreshToken,
  storeGuest,
  loadGuest,
} from '@/lib/auth';
import type { LoginResponse } from '@shared/types/mobile-api';
import type { SafeUser } from '@shared/types/common';

interface AuthState {
  user: SafeUser | null;
  /** Browsing without an account (read-only). True only when not logged in. */
  isGuest: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<boolean>;
  continueAsGuest: () => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SafeUser | null>(null);
  const [isGuest, setIsGuest] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [refresh, savedUser, guest] = await Promise.all([loadRefreshToken(), loadUser(), loadGuest()]);
        if (cancelled) return;
        if (refresh && savedUser) setUser(savedUser);
        else if (guest) setIsGuest(true);
      } catch {
        // Secure storage unavailable — treat as logged out rather than hang.
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Logging in always supersedes guest mode.
  const adoptSession = async (res: LoginResponse) => {
    setAccessToken(res.accessToken);
    await storeRefreshToken(res.refreshToken);
    await storeUser(res.user);
    await storeGuest(false);
    setIsGuest(false);
    setUser(res.user);
  };

  const login = async (email: string, password: string) => {
    const res = await apiClient.post<LoginResponse>('/auth/login', { email, password });
    await adoptSession(res);
  };

  const loginWithGoogle = async (): Promise<boolean> => {
    const idToken = await getGoogleIdToken();
    if (!idToken) return false; // user cancelled
    const res = await apiClient.post<LoginResponse>('/auth/google', { idToken });
    await adoptSession(res);
    return true;
  };

  const continueAsGuest = async () => {
    await storeGuest(true);
    setIsGuest(true);
  };

  const logout = async () => {
    const refresh = await loadRefreshToken();
    try {
      await apiClient.post('/auth/logout', refresh ? { refreshToken: refresh } : {});
    } catch {
      // ignore — we still clear locally
    }
    await clearRefreshToken();
    await storeGuest(false);
    setIsGuest(false);
    setUser(null);
  };

  const deleteAccount = async () => {
    await apiClient.del('/account');
    await clearRefreshToken();
    await storeGuest(false);
    setIsGuest(false);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isGuest, isLoading, login, loginWithGoogle, continueAsGuest, logout, deleteAccount }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
