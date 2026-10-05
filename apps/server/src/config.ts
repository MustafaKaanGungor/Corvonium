import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Server settings, kept in `data/config.json` next to the database.
 *
 * A file rather than environment variables: on Windows, setting env vars for a
 * process started at login is fiddly, and one folder that holds *everything* —
 * data and config — is exactly what gets copied to the home server later.
 * Environment variables still override, which is how Docker will set the host.
 */
export type ServerConfig = {
  /** The one bearer token — §9. Generated on first start. */
  token: string;
  host: string;
  port: number;
  /** Browser origins allowed to call the server. */
  origins: string[];
};

export const DEFAULT_ORIGINS = [
  'https://corvonium.mustafakaangungor.net',
  // The dev server, so the app can be run against a local sync server.
  'http://localhost:5173',
];

/** 32 random bytes, URL-safe — long enough that guessing it is not a strategy. */
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Read the config, creating it with a fresh token when there is none.
 * `created` tells the caller to show the token, which is the only time it is printed.
 */
export function loadConfig(dataDir: string): { config: ServerConfig; created: boolean } {
  mkdirSync(dataDir, { recursive: true });
  const path = join(dataDir, 'config.json');

  let created = false;
  let stored: Partial<ServerConfig> = {};

  if (existsSync(path)) {
    stored = JSON.parse(readFileSync(path, 'utf8')) as Partial<ServerConfig>;
  } else {
    stored = {
      token: generateToken(),
      // Loopback only: Tailscale's `serve` is what exposes it, over HTTPS, to your
      // own devices. Nothing on the LAN can reach the plain HTTP port directly.
      host: '127.0.0.1',
      port: 8787,
      origins: DEFAULT_ORIGINS,
    };
    writeFileSync(path, `${JSON.stringify(stored, null, 2)}\n`, 'utf8');
    created = true;
  }

  if (typeof stored.token !== 'string' || stored.token.length < 32) {
    throw new Error(`${path} has no usable token. Delete the file to generate a new one.`);
  }

  return {
    created,
    config: {
      token: stored.token,
      host: process.env.CORVONIUM_HOST ?? stored.host ?? '127.0.0.1',
      port: Number(process.env.CORVONIUM_PORT ?? stored.port ?? 8787),
      origins: stored.origins ?? DEFAULT_ORIGINS,
    },
  };
}
