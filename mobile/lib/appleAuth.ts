import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';

export type AppleSignInResult = { idToken: string; nonce: string; name?: string };

/** Whether Sign in with Apple is available (iOS 13+ on a real/simulated device). */
export async function isAppleSignInAvailable(): Promise<boolean> {
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

/**
 * Launches the native Sign in with Apple sheet. Returns the identity token + the
 * raw nonce we generated (the backend re-derives its SHA-256 to verify the
 * token's nonce claim), or null if the user cancelled. Apple only returns the
 * user's name on the FIRST authorization, so we forward it when present.
 */
export async function signInWithApple(): Promise<AppleSignInResult | null> {
  // Generate a random nonce; Apple embeds its SHA-256 hash in the identity token.
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);

  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
    if (!credential.identityToken) return null;
    const name = credential.fullName
      ? [credential.fullName.givenName, credential.fullName.familyName].filter(Boolean).join(' ').trim() || undefined
      : undefined;
    return { idToken: credential.identityToken, nonce: rawNonce, name };
  } catch (e: any) {
    if (e?.code === 'ERR_REQUEST_CANCELED') return null; // user cancelled
    throw e;
  }
}
