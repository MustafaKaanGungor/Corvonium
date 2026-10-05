import { useState } from 'react';
import { COLLECTIONS, isIdentical, type CollectionName, type Comparison } from '@corvonium/shared';

const NOUN: Record<CollectionName, [string, string]> = {
  items: ['item', 'items'],
  projects: ['project', 'projects'],
  sessions: ['session', 'sessions'],
};

const LABEL: Record<CollectionName, string> = {
  items: 'Items',
  projects: 'Projects',
  sessions: 'Sessions',
};

const count = (n: number, name: CollectionName) => `${n} ${NOUN[name][n === 1 ? 0 : 1]}`;

/** "2 items and 1 session", skipping the zeros. `null` when every count is zero. */
function listing(counts: Record<CollectionName, number>): string | null {
  const parts = COLLECTIONS.filter((name) => counts[name] > 0).map((name) =>
    count(counts[name], name),
  );
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0]!;
  return `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
}

const pick = (
  comparison: Comparison,
  key: 'onlyHere' | 'onlyInFile' | 'newerHere' | 'newerInFile',
) =>
  Object.fromEntries(COLLECTIONS.map((name) => [name, comparison[name][key]])) as Record<
    CollectionName,
    number
  >;

const stamp = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

const when = (ms: number | null) => (ms === null ? '—' : stamp.format(ms));

function latest(comparison: Comparison, key: 'lastChangeHere' | 'lastChangeInFile'): number | null {
  const values = COLLECTIONS.map((name) => comparison[name][key]).filter((v) => v !== null);
  return values.length === 0 ? null : Math.max(...values);
}

/**
 * The choice between this device and a backup file — decided with you: never act
 * on an import blindly, show both sides first.
 *
 * It replaces the Settings content while open, the way `SeriesChoice` takes over
 * the item sheet. Drawn entirely from `compare`, so what it promises is what
 * `mergeWrites` and a replace actually do.
 */
export function ImportReview({
  syncOn = false,
  comparison,
  exportedAt,
  busy,
  onMerge,
  onReplace,
  onExportFirst,
  onCancel,
}: {
  /** With sync on, whatever the import writes or deletes reaches every device. */
  syncOn?: boolean;
  comparison: Comparison;
  exportedAt: number;
  busy: boolean;
  onMerge: () => void;
  onReplace: () => void;
  onExportFirst: () => void;
  onCancel: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  const onlyInFile = listing(pick(comparison, 'onlyInFile'));
  const onlyHere = listing(pick(comparison, 'onlyHere'));
  const newerInFile = listing(pick(comparison, 'newerInFile'));
  const newerHere = listing(pick(comparison, 'newerHere'));

  const table = (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-[10px] font-bold tracking-[0.1em] text-[#5F6E66] uppercase">
          <th className="pb-1.5 text-left font-bold" />
          <th className="pb-1.5 text-right font-bold">This device</th>
          <th className="pb-1.5 text-right font-bold">File</th>
        </tr>
      </thead>
      <tbody>
        {COLLECTIONS.map((name) => (
          <tr key={name} className="border-t border-[#1C241E]">
            <td className="py-1.5 text-[#8A9990]">{LABEL[name]}</td>
            <td className="py-1.5 text-right tabular-nums">{comparison[name].here}</td>
            <td className="py-1.5 text-right tabular-nums">{comparison[name].inFile}</td>
          </tr>
        ))}
        <tr className="border-t border-[#1C241E] text-[11.5px]">
          <td className="py-1.5 text-[#8A9990]">Last change</td>
          <td className="py-1.5 text-right">{when(latest(comparison, 'lastChangeHere'))}</td>
          <td className="py-1.5 text-right">{when(latest(comparison, 'lastChangeInFile'))}</td>
        </tr>
      </tbody>
    </table>
  );

  const heading = (
    <div>
      <h2 className="text-lg font-semibold">Import backup</h2>
      <p className="mt-0.5 text-[11.5px] text-[#8A9990]">
        File exported {stamp.format(exportedAt)}
      </p>
      {syncOn && (
        <p className="mt-2 rounded-lg border border-[#E0A040]/40 bg-[#E0A040]/10 px-3 py-2 text-xs text-[#E0A040]">
          Sync is on: whatever this changes will change on every device.
        </p>
      )}
    </div>
  );

  if (isIdentical(comparison)) {
    return (
      <div className="space-y-4">
        {heading}
        {table}
        <p className="text-sm text-[#8A9990]">
          This file matches this device exactly. There is nothing to import.
        </p>
        <button onClick={onCancel} className="w-full rounded-lg bg-[#1C241E] px-4 py-2 text-sm">
          Close
        </button>
      </div>
    );
  }

  if (confirming) {
    const losing = [
      // "only on this device" rather than "that only exist": no verb to agree with "1 item".
      onlyHere && `${onlyHere} only on this device`,
      newerHere && `newer edits to ${newerHere}`,
    ].filter(Boolean);

    return (
      <div className="space-y-4">
        {heading}
        <p className="text-sm">Replace everything on this device with the file?</p>
        {losing.length > 0 ? (
          <p className="rounded-lg border border-[#D9614F]/40 bg-[#D9614F]/10 p-3 text-sm text-[#D9614F]">
            You will lose {losing.join(', and ')}.
          </p>
        ) : (
          <p className="text-sm text-[#8A9990]">Nothing on this device is missing from the file.</p>
        )}

        <div className="grid gap-2">
          <button
            onClick={onExportFirst}
            disabled={busy}
            className="rounded-lg bg-[#1C241E] px-4 py-2 text-sm disabled:opacity-50"
          >
            Export this device first
          </button>
          <button
            onClick={onReplace}
            disabled={busy}
            className="rounded-lg bg-[#D9614F] px-4 py-2 text-sm font-semibold text-[#1A0906] disabled:opacity-50"
          >
            Yes, replace everything
          </button>
          <button
            onClick={() => setConfirming(false)}
            disabled={busy}
            className="rounded-lg px-4 py-2 text-sm text-[#8A9990]"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  const mergeDetail = [
    onlyInFile && `adds ${onlyInFile}`,
    onlyHere && `keeps ${onlyHere} only here`,
    (newerInFile !== null || newerHere !== null) &&
      'keeps the newer version of anything edited on both',
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="space-y-4">
      {heading}
      {table}

      <div className="grid gap-2">
        <button
          onClick={onMerge}
          disabled={busy}
          className="rounded-xl border border-[#4CC26A]/50 px-3 py-2.5 text-left disabled:opacity-50"
        >
          <span className="block text-sm text-[#4CC26A]">Merge</span>
          <span className="block text-[11.5px] text-[#5F6E66]">
            {mergeDetail.charAt(0).toUpperCase() + mergeDetail.slice(1)}. Nothing is deleted.
          </span>
        </button>

        <button
          onClick={() => setConfirming(true)}
          disabled={busy}
          className="rounded-xl border border-[#28322B] px-3 py-2.5 text-left disabled:opacity-50"
        >
          <span className="block text-sm text-[#E8EFE9]">Use the file</span>
          <span className="block text-[11.5px] text-[#5F6E66]">
            This device becomes an exact copy of the backup.
          </span>
        </button>

        <button
          onClick={onCancel}
          disabled={busy}
          className="rounded-xl border border-[#28322B] px-3 py-2.5 text-left disabled:opacity-50"
        >
          <span className="block text-sm text-[#E8EFE9]">Keep this device</span>
          <span className="block text-[11.5px] text-[#5F6E66]">Nothing changes.</span>
        </button>
      </div>
    </div>
  );
}
