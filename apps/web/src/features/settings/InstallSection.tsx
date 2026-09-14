import { useEffect, useState } from 'react';
import { useInstallPrompt } from '../../lib/installPrompt';
import { formatBytes, requestPersistence, type StorageState } from '../../lib/storage';

/** Running as an installed app rather than in a browser tab. */
function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS predates the standard and still reports it here.
    (navigator as { standalone?: boolean }).standalone === true
  );
}

/**
 * What to do when there is no install button to offer.
 *
 * Only Chromium browsers fire `beforeinstallprompt`, and only once they judge the
 * app installable — Safari and Firefox never do. So the button is the exception,
 * and the useful fallback is the steps for the browser you are actually in.
 */
function manualInstallHint(): string {
  const ua = navigator.userAgent;

  // iPadOS reports itself as a Mac; the touch points give it away.
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (ios) return 'To install: tap Share, then “Add to Home Screen”.';

  if (/Firefox/.test(ua)) {
    return /Android/.test(ua)
      ? 'To install: open the ⋮ menu, then “Install”.'
      : 'Firefox on desktop cannot install apps — open this page in Chrome or Edge to install it.';
  }

  if (/Android/.test(ua))
    return 'To install: open the ⋮ menu, then “Add to Home screen” or “Install app”.';

  if (/Edg\//.test(ua)) return 'To install: open the ⋯ menu, then Apps → “Install Corvonium”.';

  return 'To install: use the install icon at the right of the address bar, or the browser menu → “Install Corvonium”.';
}

/**
 * Installing the app, and whether its data is safe where it sits.
 *
 * Both belong in Settings for the same reason: they are facts about this device
 * that are otherwise invisible. Storage persistence is granted or refused
 * silently, and the browser's own install entry is easy to miss.
 */
export function InstallSection() {
  const { canInstall, justInstalled, install } = useInstallPrompt();
  const [storage, setStorage] = useState<StorageState | null>(null);

  useEffect(() => {
    void requestPersistence().then(setStorage);
  }, []);

  return (
    <section className="space-y-2">
      <h3 className="text-[10px] font-bold tracking-[0.14em] text-[#5F6E66] uppercase">
        This device
      </h3>

      {justInstalled || isStandalone() ? (
        <p className="text-xs text-[#8A9990]">Installed as an app.</p>
      ) : canInstall ? (
        <button
          onClick={() => void install()}
          className="w-full rounded-lg bg-[#4CC26A] px-4 py-2 text-sm font-semibold text-[#06210F]"
        >
          Install Corvonium
        </button>
      ) : (
        <p className="text-xs text-[#8A9990]">{manualInstallHint()}</p>
      )}

      {/*
        Worth surfacing rather than assuming: there is no server to restore from,
        so a browser that evicts this origin takes everything with it.
      */}
      {storage !== null && (
        <p className="text-xs text-[#5F6E66]">
          {storage.persisted === true
            ? 'Storage is persistent — the browser will not evict your data.'
            : storage.persisted === false
              ? 'Storage is not persistent yet. Installing the app usually grants it.'
              : 'This browser does not report storage persistence.'}
          {storage.usage !== null && ` Using ${formatBytes(storage.usage)}.`}
        </p>
      )}
    </section>
  );
}
