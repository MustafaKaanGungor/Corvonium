import { useRef } from 'react';

export type Notice = { tone: 'ok' | 'error'; text: string };

/** Local midnight of the day `ms` falls on. */
function startOfDay(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** "today", "yesterday", "5 days ago" — counted in calendar days, not 24-hour blocks. */
function daysAgo(at: number, now: number): string {
  const days = Math.round((startOfDay(now) - startOfDay(at)) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

/**
 * Settings → Data: the backup file, both ways.
 *
 * Deliberately says how long it has been. Until sync exists a lost phone is lost
 * data, and "Last backup: 23 days ago" is the only thing in the app that says so.
 */
export function DataSection({
  now,
  lastExport,
  busy,
  notice,
  onExport,
  onImport,
}: {
  now: number;
  lastExport: number | null;
  busy: boolean;
  notice: Notice | null;
  onExport: () => void;
  onImport: (file: File) => void;
}) {
  const input = useRef<HTMLInputElement>(null);

  return (
    <section className="space-y-2">
      <h3 className="text-[10px] font-bold tracking-[0.14em] text-[#5F6E66] uppercase">Data</h3>

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={onExport}
          disabled={busy}
          className="rounded-lg bg-[#1C241E] px-3 py-2 text-sm disabled:opacity-50"
        >
          Export backup
        </button>
        <button
          onClick={() => input.current?.click()}
          disabled={busy}
          className="rounded-lg bg-[#1C241E] px-3 py-2 text-sm disabled:opacity-50"
        >
          Import backup…
        </button>
      </div>

      <input
        ref={input}
        type="file"
        accept=".json,application/json"
        aria-label="Backup file"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Cleared so choosing the same file again still fires a change.
          e.target.value = '';
          if (file) onImport(file);
        }}
      />

      <p className="text-xs text-[#5F6E66]">
        {lastExport === null
          ? 'Never exported. Your data lives only on this device.'
          : `Last export: ${daysAgo(lastExport, now)}.`}
      </p>

      {notice !== null && (
        <p
          role="status"
          className={`text-xs ${notice.tone === 'error' ? 'text-[#D9614F]' : 'text-[#4CC26A]'}`}
        >
          {notice.text}
        </p>
      )}
    </section>
  );
}
