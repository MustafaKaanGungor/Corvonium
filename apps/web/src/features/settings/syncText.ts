import type { SyncStatus } from '../../db/replication';

export type SyncTone = 'ok' | 'busy' | 'idle' | 'bad';

export const TONE_COLOUR: Record<SyncTone, string> = {
  ok: '#4CC26A',
  busy: '#E0A040',
  idle: '#5F6E66',
  bad: '#D9614F',
};

/** "just now", "4 min ago", or the time of day for anything older than an hour. */
function ago(at: number, now: number): string {
  const minutes = Math.floor((now - at) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(at);
}

/**
 * What the sync status means, in words — one source for the dot, the top bar and
 * Settings, so they can never describe the same state differently.
 */
export function describeSync(
  status: SyncStatus,
  lastSyncedAt: number | null,
  now: number,
): { tone: SyncTone; label: string; detail: string } {
  const since = lastSyncedAt === null ? '' : ` Last synced ${ago(lastSyncedAt, now)}.`;

  switch (status) {
    case 'synced':
      return {
        tone: 'ok',
        label: 'Synced',
        detail: `Up to date${lastSyncedAt === null ? '' : `, ${ago(lastSyncedAt, now)}`}.`,
      };
    case 'syncing':
      return { tone: 'busy', label: 'Syncing', detail: `Sending and receiving changes…${since}` };
    case 'connecting':
      return { tone: 'busy', label: 'Connecting', detail: 'Reaching the server…' };
    case 'offline':
      return {
        tone: 'idle',
        label: 'Offline',
        detail: `Can't reach the server. Changes are kept on this device and sync when it's back.${since}`,
      };
    case 'unauthorized':
      return {
        tone: 'bad',
        label: 'Token rejected',
        detail:
          'The server no longer accepts this token. Disconnect and connect again with the current one.',
      };
    default:
      return {
        tone: 'bad',
        label: 'Sync problem',
        detail: `The server returned an error. It will keep retrying.${since}`,
      };
  }
}
