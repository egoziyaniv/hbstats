import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import * as Updates from 'expo-updates';

// By default expo-updates downloads a new OTA on launch but only runs it on the NEXT
// launch, so people had to restart twice to see a fix. Here: on launch and whenever the
// app comes back to the foreground, check for an update, download it and reload into it
// right away. Throttled, and silent on any failure (offline, dev build, etc.).
export function useOtaUpdates() {
  const lastCheck = useRef(0);
  useEffect(() => {
    if (__DEV__ || !Updates.isEnabled) return;
    async function check() {
      if (Date.now() - lastCheck.current < 60_000) return;
      lastCheck.current = Date.now();
      try {
        const r = await Updates.checkForUpdateAsync();
        if (!r.isAvailable) return;
        await Updates.fetchUpdateAsync();
        await Updates.reloadAsync();
      } catch {
        // ignore — the default on-launch check still applies next time
      }
    }
    check();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') check(); });
    return () => sub.remove();
  }, []);
}
