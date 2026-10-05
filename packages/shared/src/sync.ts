import { COLLECTIONS, type CollectionName } from './backup';

/**
 * Sync — §7. The rules both ends must agree on, and the shapes that travel
 * between them.
 *
 * The server is dumb by design: it stores documents, orders them, and reports
 * when a push was based on a version it no longer has. **Deciding** a conflict is
 * the client's job, through `resolveConflict` — one rule, in one place.
 */

/** The same collections a backup carries, so the two cannot drift apart. */
export const SYNCED_COLLECTIONS = COLLECTIONS;
export type SyncedCollection = CollectionName;

export function isSyncedCollection(name: string): name is SyncedCollection {
  return (SYNCED_COLLECTIONS as readonly string[]).includes(name);
}

/**
 * A document as it travels: its own fields plus RxDB's tombstone flag. The server
 * never looks past `id`, and compares whole documents only for equality.
 */
export type SyncDoc = {
  id: string;
  updatedAt: number;
  _deleted: boolean;
  [field: string]: unknown;
};

/**
 * Where a device has read up to. A **server-assigned** sequence, not a client
 * `updatedAt`: a device that was offline for three days pushes documents stamped
 * three days ago, and a checkpoint on time would skip straight past them. §7, open
 * question 1.
 */
export type Checkpoint = { seq: number };

export type PullResponse = { documents: SyncDoc[]; checkpoint: Checkpoint };

/**
 * One document a device wants written, with the version it believes the server
 * holds. `assumedMasterState` is absent for a document the device has never seen
 * on the server.
 */
export type PushRow = { assumedMasterState?: SyncDoc; newDocumentState: SyncDoc };

/** The server's current copy of every row it refused. Empty when all were written. */
export type PushResponse = { conflicts: SyncDoc[] };

export type StatusResponse = {
  ok: true;
  /** Live documents per collection — tombstones not counted. */
  collections: Record<SyncedCollection, number>;
};

/* -------------------------------------------------------------------------- */
/* rules                                                                      */
/* -------------------------------------------------------------------------- */

/** An `undefined` field and a missing one are the same once JSON is involved. */
function keys(record: Record<string, unknown>): string[] {
  return Object.keys(record).filter((key) => record[key] !== undefined);
}

/**
 * Structural equality, ignoring the order of object keys.
 *
 * A document that went through JSON, SQLite and back may not list its fields in
 * the order it was written, and that must never count as a change. Array order
 * does count: segments and item ids are ordered.
 */
export function sameDocument(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((entry, index) => sameDocument(entry, b[index]));
  }

  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;

  const leftKeys = keys(left);
  if (leftKeys.length !== keys(right).length) return false;
  return leftKeys.every((key) => key in right && sameDocument(left[key], right[key]));
}

/**
 * Last write wins — §7. The newer `updatedAt` is kept; on a tie the server's copy
 * stays, so two devices resolving the same tie can never flip-flop.
 *
 * A deletion is a write like any other: a tombstone newer than an edit wins, and
 * an edit newer than a tombstone brings the document back.
 */
export function resolveConflict<T extends { updatedAt: number }>(input: {
  newDocumentState: T;
  realMasterState: T;
}): T {
  const { newDocumentState, realMasterState } = input;
  return newDocumentState.updatedAt > realMasterState.updatedAt
    ? newDocumentState
    : realMasterState;
}

/**
 * The `updatedAt` for a new write: never below the version it replaces, so a
 * document's own history only ever moves forward.
 *
 * `now` should be **server time** (see `estimateClockOffset`). This rule alone
 * does not fix clock skew — two devices editing at once are compared by their
 * stamps, and a fast clock would still win — which is why the stamp itself is
 * corrected.
 */
export function nextUpdatedAt(now: number, previous: number | null): number {
  return previous === null ? now : Math.max(now, previous + 1);
}

/** Every server response carries its clock in this header. */
export const SERVER_TIME_HEADER = 'X-Corvonium-Time';

/**
 * How far this device's clock is from the server's — §7, open question 2.
 *
 * A device whose clock runs five minutes fast would otherwise win every conflict
 * for good: last-write-wins compares stamps, and its stamps are always ahead.
 * Stamping writes in server time puts every device on one clock, so the edit made
 * later actually wins. The request's round trip is split in half, the usual NTP
 * assumption, which bounds the error by half the round trip.
 *
 * Returns `null` for a measurement too slow to trust.
 */
export function estimateClockOffset(
  serverTime: number,
  sentAt: number,
  receivedAt: number,
): number | null {
  const roundTrip = receivedAt - sentAt;
  if (!Number.isFinite(serverTime) || roundTrip < 0 || roundTrip > 2000) return null;
  return Math.round(serverTime - (sentAt + receivedAt) / 2);
}

/**
 * Whether a document may leave the device. A session that is still running is
 * not: §12 — never sync the live session, only completed ones. It is pushed the
 * moment it ends.
 */
export function shouldPush(collection: SyncedCollection, doc: Record<string, unknown>): boolean {
  return !(collection === 'sessions' && doc.endedAt === null);
}
