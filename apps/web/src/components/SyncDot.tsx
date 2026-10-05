import { useSync } from '../db/sync';
import { describeSync, TONE_COLOUR } from '../features/settings/syncText';

/**
 * The sync state as a dot — §7, *show a subtle sync-state indicator*.
 *
 * Renders nothing on a device that has never been connected: a grey "not synced"
 * dot on every screen would nag about a choice that is fine to make.
 */
export function SyncDot({ className = '' }: { className?: string }) {
  const sync = useSync();
  if (!sync.configured) return null;

  const { tone, label } = describeSync(sync.status, sync.lastSyncedAt, 0);

  return (
    <span
      role="img"
      aria-label={`Sync: ${label}`}
      title={label}
      className={`block h-[7px] w-[7px] rounded-full ${className}`}
      style={{ background: TONE_COLOUR[tone] }}
    />
  );
}
