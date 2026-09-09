import { useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';

/**
 * Whether a new build is waiting, and how to take it.
 *
 * The one file that knows Workbox exists. Keeping the virtual module behind this
 * boundary is what lets the bar be an ordinary component and the rest of the app
 * stay unaware there is a service worker at all — and it is the only module that
 * has to be mocked in a test.
 *
 * There is no service worker in dev (`devOptions.enabled: false`), so this simply
 * never reports an update there.
 */
export function usePwaUpdate(): { ready: boolean; update: () => void } {
  const [ready, setReady] = useState(false);
  const [reload, setReload] = useState<(() => void) | null>(null);

  useEffect(() => {
    const updateSW = registerSW({
      onNeedRefresh() {
        // `registerSW` returns the function that activates the waiting worker and
        // reloads. Stored in state rather than called, because the whole point of
        // `registerType: 'prompt'` is that the user decides when.
        setReady(true);
      },
    });

    setReload(() => () => void updateSW(true));
  }, []);

  return { ready, update: () => reload?.() };
}
