import { useSyncExternalStore } from 'react';

/** The event Chromium fires when the app is installable. Not in lib.dom yet. */
type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

/*
  Listened for at module load, not inside a component.

  The browser fires `beforeinstallprompt` once, shortly after the page loads. The
  install button lives in the Settings sheet, which mounts only when opened — so a
  listener registered there was always too late, and the button never appeared.
  This module is imported by the app shell, so it is evaluated before first render.

  The event is deliberately *not* `preventDefault()`ed: that would suppress the
  browser's own install UI, which is the main way anyone finds out the app can be
  installed at all. Holding the event is enough to prompt from the button too.
*/
let deferred: InstallPrompt | null = null;
let installed = false;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((listener) => listener());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    deferred = event as InstallPrompt;
    emit();
  });

  window.addEventListener('appinstalled', () => {
    deferred = null;
    installed = true;
    emit();
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Whether the browser will install the app on request, and the way to ask. */
export function useInstallPrompt(): {
  canInstall: boolean;
  justInstalled: boolean;
  install: () => Promise<void>;
} {
  const prompt = useSyncExternalStore(subscribe, () => deferred);
  const justInstalled = useSyncExternalStore(subscribe, () => installed);

  async function install() {
    if (deferred === null) return;
    const event = deferred;
    // One shot: the event cannot be reused whichever way the choice goes.
    deferred = null;
    emit();
    await event.prompt();
  }

  return { canInstall: prompt !== null, justInstalled, install };
}
