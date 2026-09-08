import {
  endSession as endPure,
  setItems as setItemsPure,
  startSession as startPure,
  switchTo as switchToPure,
  type SegmentKind,
  type Session,
} from '@corvonium/shared';
import { getDatabase } from './database';

/**
 * The single point of mutation for sessions, mirroring `db/items.ts`.
 *
 * Every write goes through `apply`, which runs one of the pure transitions from
 * `@corvonium/shared` against the *current* document. That is `incrementalModify`
 * rather than `incrementalPatch` on purpose: the database is `multiInstance`, so
 * two tabs can hold the same running session, and patching a segment array
 * computed from a possibly-stale read is how a segment goes missing.
 * `incrementalModify` re-runs the function against the latest state and retries on
 * conflict.
 */
async function apply(id: string, change: (session: Session) => Session): Promise<void> {
  const db = await getDatabase();
  const doc = await db.sessions.findOne(id).exec();
  if (!doc) return;
  await doc.incrementalModify((current) => change(current as Session));
}

/** The running session, or `null`. There is only ever one. */
export async function findLiveSession(): Promise<Session | null> {
  const db = await getDatabase();
  const doc = await db.sessions.findOne({ selector: { endedAt: null } }).exec();
  return doc ? (doc.toJSON() as Session) : null;
}

/**
 * Open a session, or resume the one already running.
 *
 * Starting twice must never produce two live sessions — the day's total is the sum
 * of its sessions, and a stray second one would double-count the same minutes.
 */
export async function startSession(now: number, itemIds: string[] = []): Promise<Session> {
  const live = await findLiveSession();
  if (live !== null) return live;

  const db = await getDatabase();
  const session = startPure(now, crypto.randomUUID());

  // Starting from an item's detail pane puts you straight on that item. Safe to
  // assign in place: `startPure` just built this and nothing else has seen it.
  const first = session.segments[0];
  if (first !== undefined && itemIds.length > 0) first.itemIds = itemIds;

  await db.sessions.insert(session);
  return session;
}

export function switchTo(session: Session, kind: SegmentKind, now: number): Promise<void> {
  return apply(session.id, (current) => switchToPure(current, kind, now));
}

export function setItems(session: Session, itemIds: string[], now: number): Promise<void> {
  return apply(session.id, (current) => setItemsPure(current, itemIds, now));
}

/**
 * End a session at `at` — the present for a normal End Session, a past instant
 * when the failsafe trims a forgotten one. One function for both, because they are
 * the same operation with a different argument.
 */
export function endSession(session: Session, at: number): Promise<void> {
  return apply(session.id, (current) => endPure(current, at));
}

/**
 * The heartbeat: record that the app was open and visible just now.
 *
 * Deliberately does not touch `updatedAt` — this is device-local bookkeeping about
 * our own attention, not a change to what the session says happened.
 */
export function touchSession(session: Session, now: number): Promise<void> {
  return apply(session.id, (current) => ({ ...current, lastSeenAt: now }));
}
