import { useEffect, useState } from 'react';
import { formatBytes, requestPersistence, type StorageState } from '../../lib/storage';

/** The event Chrome fires when the app is installable. Not in lib.dom yet. */
type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

/** Running as an installed app rather than in a browser tab. */
function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS predates the standard and still reports it here.
    (navigator as { standalone?: boolean }).standalone === true
  );
}

/**
 * Installing the app, and whether its data is safe where it sits.
 *
 * Both belong in Settings for the same reason: they are facts about this device
 * that are otherwise invisible. Chrome's own install prompt is a mini-infobar
 * that is easy to miss, and storage persistence is granted or refused silently.
 */
export function InstallSection() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(() => isStandalone());
  const [storage, setStorage] = useState<StorageState | null>(null);

  useEffect(() => {
    // Chrome fires this instead of showing its own banner once the event is
    // captured, so holding it is what puts the choice on a button here.
    function onPrompt(event: Event) {
      event.preventDefault();
      setPrompt(event as InstallPrompt);
    }

    function onInstalled() {
      setInstalled(true);
      setPrompt(null);
    }

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  useEffect(() => {
    void requestPersistence().then(setStorage);
  }, []);

  async function install() {
    if (prompt === null) return;
    await prompt.prompt();
    // One shot: the event cannot be reused whichever way the choice went.
    setPrompt(null);
  }

  return (
    <section className="space-y-2">
      <h3 className="text-[10px] font-bold tracking-[0.14em] text-[#5F6E66] uppercase">
        This device
      </h3>

      {installed ? (
        <p className="text-xs text-[#8A9990]">Installed as an app.</p>
      ) : prompt !== null ? (
        <button
          onClick={() => void install()}
          className="w-full rounded-lg bg-[#4CC26A] px-4 py-2 text-sm font-semibold text-[#06210F]"
        >
          Install Corvonium
        </button>
      ) : (
        <p className="text-xs text-[#5F6E66]">
          Not installable here — use the browser&rsquo;s own install option, or open the app over
          HTTPS.
        </p>
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
