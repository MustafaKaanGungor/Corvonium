import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ConnectResult, SyncView } from '../../db/sync';
import { SyncSection } from './SyncSection';
import { describeSync } from './syncText';

const NOW = new Date(2026, 8, 16, 12, 0).getTime();

function setup(
  sync: SyncView,
  connect: ConnectResult = { ok: true, counts: { items: 48, projects: 1, sessions: 0 } },
) {
  const handlers = {
    onConnect: vi.fn(async () => connect),
    onDisconnect: vi.fn(async () => {}),
    onSyncNow: vi.fn(),
  };
  render(<SyncSection sync={sync} now={NOW} {...handlers} />);
  return handlers;
}

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

afterEach(() => vi.restoreAllMocks());

describe('a device that is not connected', () => {
  it('asks for the address and token, and says the data is local only', () => {
    setup({ configured: false });

    expect(screen.getByLabelText('Server address')).toBeInTheDocument();
    expect(screen.getByLabelText('Token')).toHaveAttribute('type', 'password');
    expect(screen.getByText(/lives only on this device/)).toBeInTheDocument();
  });

  it('connects with what was typed and reports what the server holds', async () => {
    const { onConnect } = setup({ configured: false });
    type('Server address', 'my-pc.tail1234.ts.net');
    type('Token', 'secret');

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Connect' })));

    expect(onConnect).toHaveBeenCalledWith('my-pc.tail1234.ts.net', 'secret');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Connected. The server has 48 items, 1 project and 0 sessions.',
    );
    // The secret does not linger in the field.
    expect(screen.getByLabelText('Token')).toHaveValue('');
  });

  it('shows why a connection failed, and keeps what was typed', async () => {
    setup({ configured: false }, { ok: false, reason: 'The server rejected that token.' });
    type('Token', 'wrong');

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Connect' })));

    expect(screen.getByRole('status')).toHaveTextContent('The server rejected that token.');
    expect(screen.getByLabelText('Token')).toHaveValue('wrong');
  });
});

describe('a connected device', () => {
  const synced: SyncView = {
    configured: true,
    url: 'https://my-pc.tail1234.ts.net',
    status: 'synced',
    lastSyncedAt: NOW - 4 * 60_000,
  };

  it('shows the server, the state and how long ago it synced', () => {
    setup(synced);

    expect(screen.getByText('https://my-pc.tail1234.ts.net')).toBeInTheDocument();
    expect(screen.getByText('Synced')).toBeInTheDocument();
    expect(screen.getByText('Up to date, 4 min ago.')).toBeInTheDocument();
  });

  it('syncs now on request', () => {
    const { onSyncNow } = setup(synced);
    fireEvent.click(screen.getByRole('button', { name: 'Sync now' }));
    expect(onSyncNow).toHaveBeenCalledOnce();
  });

  it('asks before disconnecting, and does nothing if you say no', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { onDisconnect } = setup(synced);

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Disconnect' })));

    expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/Everything stays here/));
    expect(onDisconnect).not.toHaveBeenCalled();
  });

  it('disconnects once confirmed', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { onDisconnect } = setup(synced);

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Disconnect' })));
    expect(onDisconnect).toHaveBeenCalledOnce();
  });
});

describe('describeSync', () => {
  it.each([
    ['synced', 'ok', 'Synced'],
    ['syncing', 'busy', 'Syncing'],
    ['connecting', 'busy', 'Connecting'],
    ['offline', 'idle', 'Offline'],
    ['unauthorized', 'bad', 'Token rejected'],
    ['error', 'bad', 'Sync problem'],
  ] as const)('%s reads as %s, "%s"', (status, tone, label) => {
    expect(describeSync(status, null, NOW)).toMatchObject({ tone, label });
  });

  it('tells an offline device its changes are safe', () => {
    expect(describeSync('offline', NOW - 2 * 60 * 60_000, NOW).detail).toMatch(
      /Changes are kept on this device.*Last synced/,
    );
  });
});
