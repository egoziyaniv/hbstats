import { GoogleSignin, isSuccessResponse } from '@react-native-google-signin/google-signin';

let configured = false;

function ensureConfigured() {
  if (configured) return;
  GoogleSignin.configure({
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    // webClientId makes the returned idToken audience the web client, which the
    // backend accepts (it allows both web + iOS client IDs as audiences).
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  });
  configured = true;
}

/**
 * Launches the native Google sign-in sheet and returns the Google ID token,
 * or null if the user cancelled. Throws on a real failure.
 */
export async function getGoogleIdToken(): Promise<string | null> {
  ensureConfigured();
  await GoogleSignin.hasPlayServices();
  const response = await GoogleSignin.signIn();
  if (isSuccessResponse(response)) {
    return response.data.idToken ?? null;
  }
  return null; // cancelled
}
