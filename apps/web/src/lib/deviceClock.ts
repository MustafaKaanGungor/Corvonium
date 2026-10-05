import { estimateClockOffset } from '@corvonium/shared';

/**
 * This device's clock, corrected to the sync server's — §7, open question 2.
 *
 * Used for exactly one thing: stamping `updatedAt`, which is what last-write-wins
 * compares across devices. Everything the app *shows* still uses the device's own
 * clock through `useNow`; a phone five minutes fast should still say what its own
 * clock says.
 */
export type DeviceClock = {
  /** Now, in server time as best known. The device's own clock until first measured. */
  now(): number;
  /** Feed one request's timing. Ignored if the round trip was too slow to trust. */
  observe(serverTime: number, sentAt: number, receivedAt: number): void;
  /** The raw device clock, for timing requests. */
  local(): number;
};

export function createDeviceClock(
  options: { local?: () => number; storageKey?: string | null } = {},
): DeviceClock {
  const local = options.local ?? (() => Date.now());
  const key = options.storageKey === undefined ? 'corvonium.clockOffset' : options.storageKey;

  // Remembered, so a device that starts offline still stamps in server time.
  let offset = 0;
  if (key !== null) {
    try {
      const stored = Number(localStorage.getItem(key));
      if (Number.isFinite(stored)) offset = stored;
    } catch {
      // No storage: start uncorrected, and measure again on the first request.
    }
  }

  return {
    now: () => local() + offset,
    local,
    observe(serverTime, sentAt, receivedAt) {
      const measured = estimateClockOffset(serverTime, sentAt, receivedAt);
      if (measured === null) return;
      offset = measured;
      if (key === null) return;
      try {
        localStorage.setItem(key, String(offset));
      } catch {
        // Kept for this session only.
      }
    },
  };
}

/** The app's one clock for sync stamps. */
export const deviceClock = createDeviceClock();
