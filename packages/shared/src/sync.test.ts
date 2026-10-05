import { describe, expect, it } from 'vitest';
import {
  estimateClockOffset,
  isSyncedCollection,
  nextUpdatedAt,
  resolveConflict,
  sameDocument,
  shouldPush,
  type SyncDoc,
} from './sync';

const doc = (over: Partial<SyncDoc> = {}): SyncDoc => ({
  id: 'a',
  updatedAt: 100,
  _deleted: false,
  title: 'Take the bins out',
  ...over,
});

describe('sameDocument', () => {
  it('ignores the order fields are listed in', () => {
    expect(sameDocument({ a: 1, b: { c: 2, d: 3 } }, { b: { d: 3, c: 2 }, a: 1 })).toBe(true);
  });

  it('notices a changed value, however deep', () => {
    expect(sameDocument({ s: [{ kind: 'work' }] }, { s: [{ kind: 'break' }] })).toBe(false);
  });

  it('treats array order as meaningful', () => {
    expect(sameDocument({ ids: ['x', 'y'] }, { ids: ['y', 'x'] })).toBe(false);
  });

  it('notices an added or missing field', () => {
    expect(sameDocument({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(sameDocument({ a: 1, b: 2 }, { a: 1 })).toBe(false);
  });

  it('counts an undefined field as absent, the way JSON does', () => {
    expect(sameDocument({ a: 1, b: undefined }, { a: 1 })).toBe(true);
  });

  it('tells null, missing and object apart', () => {
    expect(sameDocument({ a: null }, { a: {} })).toBe(false);
    expect(sameDocument({ a: null }, {})).toBe(false);
    expect(sameDocument(null, undefined)).toBe(false);
  });
});

describe('resolveConflict', () => {
  it('keeps the newer write', () => {
    const mine = doc({ updatedAt: 200, title: 'mine' });
    const server = doc({ updatedAt: 150, title: 'server' });

    expect(resolveConflict({ newDocumentState: mine, realMasterState: server })).toBe(mine);
    expect(resolveConflict({ newDocumentState: server, realMasterState: mine })).toBe(mine);
  });

  it("keeps the server's copy on a tie, so two devices settle the same way", () => {
    const mine = doc({ title: 'mine' });
    const server = doc({ title: 'server' });

    expect(resolveConflict({ newDocumentState: mine, realMasterState: server })).toBe(server);
  });

  it('lets a newer deletion win over an older edit', () => {
    const deleted = doc({ updatedAt: 300, _deleted: true });
    const edited = doc({ updatedAt: 250, title: 'edited meanwhile' });

    expect(resolveConflict({ newDocumentState: deleted, realMasterState: edited })._deleted).toBe(
      true,
    );
  });

  it('lets a newer edit bring a deleted document back', () => {
    const deleted = doc({ updatedAt: 300, _deleted: true });
    const edited = doc({ updatedAt: 400 });

    expect(resolveConflict({ newDocumentState: edited, realMasterState: deleted })._deleted).toBe(
      false,
    );
  });
});

describe('nextUpdatedAt', () => {
  it('is simply now when there is nothing before it', () => {
    expect(nextUpdatedAt(1_000, null)).toBe(1_000);
  });

  it('is now when the clock is ahead of the last write', () => {
    expect(nextUpdatedAt(1_000, 900)).toBe(1_000);
  });

  it('never goes backwards, even against a version from a faster clock', () => {
    // The version being edited came from a device five minutes fast.
    const fromFastDevice = 1_000 + 5 * 60_000;
    const stamped = nextUpdatedAt(1_000, fromFastDevice);

    expect(stamped).toBe(fromFastDevice + 1);
    // …which is exactly what makes this edit beat the version it replaced.
    expect(
      resolveConflict({
        newDocumentState: doc({ updatedAt: stamped }),
        realMasterState: doc({ updatedAt: fromFastDevice }),
      }).updatedAt,
    ).toBe(stamped);
  });
});

describe('estimateClockOffset', () => {
  it('measures a fast device clock as a negative offset', () => {
    // Device is 5 minutes ahead: it sent at 1_300_000 and heard back at 1_300_100,
    // while the server's clock read 1_000_050 in between.
    expect(estimateClockOffset(1_000_050, 1_300_000, 1_300_100)).toBe(-300_000);
  });

  it('is zero for clocks that agree', () => {
    expect(estimateClockOffset(5_050, 5_000, 5_100)).toBe(0);
  });

  it('refuses a measurement with a round trip too slow to trust', () => {
    expect(estimateClockOffset(5_000, 0, 10_000)).toBeNull();
  });

  it('refuses nonsense', () => {
    expect(estimateClockOffset(Number.NaN, 0, 10)).toBeNull();
    expect(estimateClockOffset(5, 10, 0)).toBeNull();
  });
});

describe('shouldPush', () => {
  it('holds back a session that is still running', () => {
    expect(shouldPush('sessions', { id: 's', endedAt: null })).toBe(false);
  });

  it('sends a session once it has ended', () => {
    expect(shouldPush('sessions', { id: 's', endedAt: 5 })).toBe(true);
  });

  it('sends every item and project, whatever their fields', () => {
    expect(shouldPush('items', { id: 'i', endedAt: null })).toBe(true);
    expect(shouldPush('projects', { id: 'p' })).toBe(true);
  });
});

describe('isSyncedCollection', () => {
  it('knows exactly the three collections', () => {
    expect(['items', 'projects', 'sessions'].every(isSyncedCollection)).toBe(true);
    expect(isSyncedCollection('settings')).toBe(false);
    expect(isSyncedCollection('__proto__')).toBe(false);
  });
});
