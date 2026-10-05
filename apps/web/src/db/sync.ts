import { useSyncExternalStore } from 'react';
import { normalizeServerUrl, readSyncConfig, writeSyncConfig } from '../lib/deviceConfig';
import { getDatabase } from './database';
import {
  checkServer,
  startSync,
  type ServerCheck,
  type SyncController,
  type SyncState,
} from './replication';

/**
 * The one running sync, for the whole app.
 *
 * Module state rather than React state: sync outlives every screen and sheet, and
 * there must never be two of it — two replications of the same collection would
 * race each other. React reads it through `useSync`.
 */

export type SyncView = { configured: false } | ({ configured: true; url: string } & SyncState);

let controller: SyncController | null = null;
let view: SyncView = { configured: false };
const listeners = new Set<() => void>();

function publish(next: SyncView) {
  view = next;
  listeners.forEach((listener) => listener());
}

async function run(config: { url: string; token: string }) {
  await stopRunning();
  const db = await getDatabase();

  const started = startSync(db, config);
  controller = started;
  started.state$.subscribe((state) => {
    // A stale subscription from a replaced controller must not overwrite the view.
    if (controller === started) publish({ configured: true, url: config.url, ...state });
  });
}

async function stopRunning() {
  const running = controller;
  controller = null;
  await running?.stop();
}

/** On launch: resume syncing if this device was set up before. */
export function resumeSync(): void {
  const config = readSyncConfig();
  if (config !== null && controller === null) void run(config);
}

export type ConnectResult =
  | { ok: true; counts: Extract<ServerCheck, { ok: true }>['counts'] }
  | { ok: false; reason: string };

/** Check the address and token against the server, and only then save and start. */
export async function connectSync(address: string, token: string): Promise<ConnectResult> {
  const url = normalizeServerUrl(address);
  if (!url.ok) return url;
  if (token.trim() === '') return { ok: false, reason: 'Paste the token from the server.' };

  const config = { url: url.url, token: token.trim() };
  const check = await checkServer(config);

  if (!check.ok) {
    return {
      ok: false,
      reason: {
        unreachable: "Can't reach the server. Is it running, and is Tailscale on for this device?",
        unauthorized: 'The server rejected that token.',
        'not-corvonium': "Something answered, but it isn't a Corvonium sync server.",
      }[check.reason],
    };
  }

  writeSyncConfig(config);
  await run(config);
  return { ok: true, counts: check.counts };
}

/** Pull and push now, instead of waiting for the stream or the next retry. */
export function syncNow(): void {
  controller?.reSync();
}

/** Stop syncing on this device. Everything stays here; nothing is deleted anywhere. */
export async function disconnectSync(): Promise<void> {
  writeSyncConfig(null);
  await stopRunning();
  publish({ configured: false });
}

export function useSync(): SyncView {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => view,
  );
}
