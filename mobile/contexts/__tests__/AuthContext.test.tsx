import React from 'react';
import { Text, Button } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { server } from '../../__tests__/msw/server';
import { setAccessToken, getAccessToken } from '../../lib/auth';
import { AuthProvider, useAuth } from '../AuthContext';

// This unit-test file mocks global.fetch directly via jest.fn().
// Stop the MSW server (started in jest.setup.ts) so MSW does not intercept
// these calls — the jest.fn() mock is the sole fetch handler here.
beforeAll(() => server.close());
afterAll(() => server.listen({ onUnhandledRequest: 'bypass' }));

const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;

function Probe() {
  const { user, login, logout, isLoading } = useAuth();
  if (isLoading) return <Text testID="loading">loading</Text>;
  return (
    <>
      <Text testID="user">{user ? user.email : 'anon'}</Text>
      <Button title="login" onPress={() => login('a@b.c', 'pw').catch(() => {})} />
      <Button title="logout" onPress={() => logout()} />
    </>
  );
}

beforeEach(async () => {
  fetchMock.mockReset();
  setAccessToken(null);
  // Drain the stateful SecureStore mock between tests
  await SecureStore.deleteItemAsync('hbs_refresh');
  await SecureStore.deleteItemAsync('hbs_user');
});

describe('AuthContext', () => {
  test('starts with no user when SecureStore has no refresh token', async () => {
    const { findByText } = render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    expect(await findByText('anon')).toBeTruthy();
  });

  test('login sets user from /auth/login response', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          accessToken: 'at',
          refreshToken: 'rt',
          user: { id: 'u1', email: 'me@test.tld', name: 'Me', role: 'USER', avatarUrl: null },
        }),
        { status: 200 }
      )
    );

    const { findByText, getByText } = render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    await findByText('anon');

    await act(async () => {
      fireEvent.press(getByText('login'));
    });

    await waitFor(() => expect(SecureStore.setItemAsync).toHaveBeenCalled());
    expect(await findByText('me@test.tld')).toBeTruthy();
  });

  test('logout clears user state and refresh token', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          accessToken: 'at',
          refreshToken: 'rt',
          user: { id: 'u1', email: 'me@test.tld', name: 'Me', role: 'USER', avatarUrl: null },
        }),
        { status: 200 }
      )
    );
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 })); // logout

    const { findByText, getByText } = render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    await findByText('anon');

    await act(async () => fireEvent.press(getByText('login')));
    await findByText('me@test.tld');

    await act(async () => fireEvent.press(getByText('logout')));

    await waitFor(async () => {
      const stored = await SecureStore.getItemAsync('hbs_refresh');
      expect(stored).toBeNull();
    });
    expect(await findByText('anon')).toBeTruthy();
  });
});


test('does not restore a saved user after the server rejects their refresh token', async () => {
  await SecureStore.setItemAsync('hbs_refresh', 'revoked');
  await SecureStore.setItemAsync('hbs_user', JSON.stringify({ id: 'u1', email: 'old@test.tld' }));
  fetchMock.mockResolvedValueOnce(new Response('{}', { status: 401 }));
  const { findByText } = render(<AuthProvider><Probe /></AuthProvider>);
  expect(await findByText('anon')).toBeTruthy();
});

test('keeps the saved identity during a transient refresh outage', async () => {
  await SecureStore.setItemAsync('hbs_refresh', 'valid');
  await SecureStore.setItemAsync('hbs_user', JSON.stringify({ id: 'u1', email: 'offline@test.tld' }));
  fetchMock.mockResolvedValueOnce(new Response('{}', { status: 503 }));
  const { findByText } = render(<AuthProvider><Probe /></AuthProvider>);
  expect(await findByText('offline@test.tld')).toBeTruthy();
});


test('does not activate an access token when secure session storage fails', async () => {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
    accessToken: 'must-not-activate', refreshToken: 'secret',
    user: { id: 'u1', email: 'me@test.tld' },
  }), { status: 200 }));
  const { findByText, getByText } = render(<AuthProvider><Probe /></AuthProvider>);
  await findByText('anon');
  (SecureStore.setItemAsync as jest.Mock).mockRejectedValueOnce(new Error('keychain unavailable'));
  await act(async () => fireEvent.press(getByText('login')));
  expect(getAccessToken()).toBeNull();
  expect(getByText('anon')).toBeTruthy();
});
