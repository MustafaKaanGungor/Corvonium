import { useState } from 'react';
import type { ConnectResult, SyncView } from '../../db/sync';
import { describeSync, TONE_COLOUR } from './syncText';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Settings → Sync: connect this device to the sync server, and see how it is doing.
 *
 * Takes its actions as props rather than importing them, so it renders in a test
 * without a database or a server behind it.
 */
export function SyncSection({
  sync,
  now,
  onConnect,
  onDisconnect,
  onSyncNow,
}: {
  sync: SyncView;
  now: number;
  onConnect: (address: string, token: string) => Promise<ConnectResult>;
  onDisconnect: () => Promise<void>;
  onSyncNow: () => void;
}) {
  const [address, setAddress] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  async function connect() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await onConnect(address, token);
      if (result.ok) {
        const { items, projects, sessions } = result.counts;
        setMessage({
          tone: 'ok',
          text: `Connected. The server has ${plural(items, 'item')}, ${plural(projects, 'project')} and ${plural(sessions, 'session')}.`,
        });
        setToken('');
      } else {
        setMessage({ tone: 'error', text: result.reason });
      }
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    const ok = window.confirm(
      'Stop syncing this device?\n\nEverything stays here, and nothing is deleted on the server or your other devices.',
    );
    if (!ok) return;
    await onDisconnect();
    setMessage(null);
  }

  const heading = (
    <h3 className="text-[10px] font-bold tracking-[0.14em] text-[#5F6E66] uppercase">Sync</h3>
  );

  const feedback = message !== null && (
    <p
      role="status"
      className={`text-xs ${message.tone === 'error' ? 'text-[#D9614F]' : 'text-[#4CC26A]'}`}
    >
      {message.text}
    </p>
  );

  if (!sync.configured) {
    return (
      <section className="space-y-2">
        {heading}
        <input
          className="w-full rounded-lg border border-[#28322B] bg-[#1C241E] px-3 py-2 text-sm"
          placeholder="Server address, e.g. https://my-pc.tail1234.ts.net"
          aria-label="Server address"
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
        <input
          className="w-full rounded-lg border border-[#28322B] bg-[#1C241E] px-3 py-2 text-sm"
          placeholder="Token"
          aria-label="Token"
          type="password"
          autoComplete="off"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !busy && void connect()}
        />
        <button
          onClick={() => void connect()}
          disabled={busy}
          className="w-full rounded-lg bg-[#1C241E] px-3 py-2 text-sm disabled:opacity-50"
        >
          {busy ? 'Connecting…' : 'Connect'}
        </button>
        {feedback}
        <p className="text-xs text-[#5F6E66]">
          Not connected. Everything lives only on this device.
        </p>
      </section>
    );
  }

  const { tone, label, detail } = describeSync(sync.status, sync.lastSyncedAt, now);

  return (
    <section className="space-y-2">
      {heading}
      <div className="space-y-1 rounded-lg bg-[#1C241E] px-3 py-2">
        <p className="flex items-center gap-2 text-sm">
          <span
            className="block h-[7px] w-[7px] rounded-full"
            style={{ background: TONE_COLOUR[tone] }}
          />
          {label}
        </p>
        <p className="truncate text-[11.5px] text-[#8A9990]" title={sync.url}>
          {sync.url}
        </p>
        <p className="text-xs text-[#5F6E66]">{detail}</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={onSyncNow} className="rounded-lg bg-[#1C241E] px-3 py-2 text-sm">
          Sync now
        </button>
        <button
          onClick={() => void disconnect()}
          className="rounded-lg bg-[#1C241E] px-3 py-2 text-sm text-[#D9614F]"
        >
          Disconnect
        </button>
      </div>
      {feedback}
    </section>
  );
}
