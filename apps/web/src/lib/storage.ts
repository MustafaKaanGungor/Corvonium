/**
 * Persistent storage — §8.
 *
 * This matters more than the manifest does. Every item, session and project lives
 * in IndexedDB and there is no server to restore any of it from, so a browser
 * under storage pressure will evict a non-persistent origin **without asking**.
 * Asking for persistence is the only defence until Phase 2 exists.
 *
 * Chrome grants it silently on an installed or sufficiently-engaged origin and
 * refuses otherwise, so the answer is reported rather than assumed.
 */

export type StorageState = {
  /** `null` when the browser does not implement the Storage API at all. */
  persisted: boolean | null;
  /** Bytes used by this origin, or `null` when unavailable. */
  usage: number | null;
};

/**
 * Ask for persistence if it has not already been granted, and report the result.
 *
 * Safe to call on every launch: `persist()` resolves immediately when the answer
 * is already yes, and a refusal is not an error worth surfacing — the app works
 * either way, it is just more fragile.
 */
export async function requestPersistence(): Promise<StorageState> {
  if (typeof navigator === 'undefined' || navigator.storage === undefined) {
    return { persisted: null, usage: null };
  }

  let persisted: boolean | null = null;

  try {
    persisted = await navigator.storage.persisted();
    if (!persisted && navigator.storage.persist !== undefined) {
      persisted = await navigator.storage.persist();
    }
  } catch {
    persisted = null;
  }

  let usage: number | null = null;

  try {
    usage = (await navigator.storage.estimate?.())?.usage ?? null;
  } catch {
    usage = null;
  }

  return { persisted, usage };
}

/** Bytes as something readable — `1.4 MB`. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
