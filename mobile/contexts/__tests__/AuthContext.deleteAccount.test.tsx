import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { apiClient } from '@/lib/apiClient';
import { clearRefreshToken } from '@/lib/auth';

jest.mock('@/lib/apiClient', () => ({
  apiClient: { del: jest.fn(), post: jest.fn(), get: jest.fn(), put: jest.fn() },
}));
jest.mock('@/lib/auth', () => ({
  setAccessToken: jest.fn(),
  storeRefreshToken: jest.fn(),
  loadRefreshToken: jest.fn().mockResolvedValue('refresh-x'),
  storeUser: jest.fn(),
  loadUser: jest.fn().mockResolvedValue(null),
  clearRefreshToken: jest.fn(),
  storeGuest: jest.fn(),
  loadGuest: jest.fn().mockResolvedValue(false),
}));

it('deleteAccount calls the endpoint and clears local auth', async () => {
  (apiClient.del as jest.Mock).mockResolvedValue(undefined);
  const wrapper = ({ children }: { children: React.ReactNode }) => <AuthProvider>{children}</AuthProvider>;
  const { result } = renderHook(() => useAuth(), { wrapper });

  await act(async () => { await result.current.deleteAccount(); });

  expect(apiClient.del).toHaveBeenCalledWith('/account');
  expect(clearRefreshToken).toHaveBeenCalled();
  expect(result.current.user).toBeNull();
});
