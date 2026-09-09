import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatBytes, requestPersistence } from './storage';

/** Replace `navigator.storage` with a stub, or remove it entirely. */
function withStorage(storage: Partial<StorageManager> | undefined) {
  Object.defineProperty(navigator, 'storage', {
    value: storage,
    configurable: true,
    writable: true,
  });
}

afterEach(() => vi.restoreAllMocks());

describe('requestPersistence', () => {
  it('asks for persistence when it has not been granted', async () => {
    const persist = vi.fn().mockResolvedValue(true);
    withStorage({
      persisted: vi.fn().mockResolvedValue(false),
      persist,
      estimate: vi.fn().mockResolvedValue({ usage: 2048 }),
    });

    expect(await requestPersistence()).toEqual({ persisted: true, usage: 2048 });
    expect(persist).toHaveBeenCalled();
  });

  it('does not ask again once it is already granted', async () => {
    const persist = vi.fn();
    withStorage({
      persisted: vi.fn().mockResolvedValue(true),
      persist,
      estimate: vi.fn().mockResolvedValue({ usage: 0 }),
    });

    expect((await requestPersistence()).persisted).toBe(true);
    expect(persist).not.toHaveBeenCalled();
  });

  it('reports a refusal rather than treating it as an error', async () => {
    // A refusal is not a failure: the app works either way, just closer to the
    // edge — so it is surfaced in Settings, not thrown.
    withStorage({
      persisted: vi.fn().mockResolvedValue(false),
      persist: vi.fn().mockResolvedValue(false),
      estimate: vi.fn().mockResolvedValue({ usage: 100 }),
    });

    expect(await requestPersistence()).toEqual({ persisted: false, usage: 100 });
  });

  it('says nothing rather than crashing where the API is missing', async () => {
    withStorage(undefined);
    expect(await requestPersistence()).toEqual({ persisted: null, usage: null });
  });

  it('survives a browser that throws instead of answering', async () => {
    withStorage({
      persisted: vi.fn().mockRejectedValue(new Error('denied')),
      persist: vi.fn(),
      estimate: vi.fn().mockRejectedValue(new Error('denied')),
    });

    expect(await requestPersistence()).toEqual({ persisted: null, usage: null });
  });

  it('still reports persistence when usage is unavailable', async () => {
    withStorage({
      persisted: vi.fn().mockResolvedValue(true),
      persist: vi.fn(),
      estimate: vi.fn().mockResolvedValue({}),
    });

    expect(await requestPersistence()).toEqual({ persisted: true, usage: null });
  });
});

describe('formatBytes', () => {
  it.each([
    [512, '512 B'],
    [2048, '2 KB'],
    [1024 * 1024 * 1.5, '1.5 MB'],
    [0, '0 B'],
  ])('reads %i as %s', (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });
});
