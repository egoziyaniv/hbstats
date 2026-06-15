import { Linking } from 'react-native';

/**
 * Open an external link only if it's a real http(s) URL. News item URLs come
 * from an external feed; guarding the scheme prevents opening javascript:, file:
 * or other unexpected schemes via Linking.openURL.
 */
export function openExternalUrl(url: string | null | undefined): void {
  if (!url || !/^https?:\/\//i.test(url)) return;
  Linking.openURL(url).catch(() => {
    // ignore — nothing actionable if the OS can't open it
  });
}
