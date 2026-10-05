/**
 * How *this* device reaches the sync server — §6, device config.
 *
 * Local only, never synced and never exported: you cannot sync the settings that
 * tell you how to sync, and the token is a secret that belongs to one device's
 * storage, not to a backup file you might email yourself.
 */

export type SyncConfig = { url: string; token: string };

const KEY = 'corvonium.sync';

export function readSyncConfig(): SyncConfig | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as Partial<SyncConfig>;
    return typeof parsed.url === 'string' && typeof parsed.token === 'string'
      ? { url: parsed.url, token: parsed.token }
      : null;
  } catch {
    return null;
  }
}

export function writeSyncConfig(config: SyncConfig | null): void {
  try {
    if (config === null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(config));
  } catch {
    // Storage refused: sync still runs for this session, it just won't be remembered.
  }
}

/**
 * Tidy what was typed into an address the app can call, or explain why it can't.
 *
 * The app is served over HTTPS, and a browser blocks an HTTPS page from calling
 * plain HTTP — so only HTTPS is accepted, apart from the machine you are on, which
 * is how the server is tried out before Tailscale is set up.
 */
export function normalizeServerUrl(
  input: string,
): { ok: true; url: string } | { ok: false; reason: string } {
  const trimmed = input.trim();
  if (trimmed === '') return { ok: false, reason: 'Enter the server address.' };

  const withScheme = /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return { ok: false, reason: "That doesn't look like an address." };
  }

  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
    return { ok: false, reason: 'The address must start with https://.' };
  }

  // Origin plus any path, without a trailing slash, so routes can be appended.
  return { ok: true, url: `${url.origin}${url.pathname}`.replace(/\/+$/, '') };
}
