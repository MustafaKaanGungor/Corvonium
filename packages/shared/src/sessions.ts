import type { Item, Segment, SegmentKind, Session } from './types';

/**
 * Sessions, derived and transformed. Everything Work Mode shows is computed here
 * from the segment list — §3.5 — and every function takes `now` rather than
 * reading the clock, so all of it is testable without mocking time.
 */

/* -------------------------------------------------------------------------- */
/* derivation                                                                  */
/* -------------------------------------------------------------------------- */

const pad = (n: number) => String(n).padStart(2, '0');

/** The open segment, or `null` on a session that has ended. */
export function liveSegment(session: Session): Segment | null {
  return session.segments.find((seg) => seg.endedAt === null) ?? null;
}

/**
 * How long a segment ran. The live one is measured against the wall clock rather
 * than an accumulating counter, which is what lets the timer survive tab
 * suspension, phone sleep and restarts — §6.
 */
export function segmentDuration(segment: Segment, now: number): number {
  return Math.max(0, (segment.endedAt ?? now) - segment.startedAt);
}

export type SessionTotals = {
  work: number;
  break: number;
  total: number;
  /** Work ÷ total, 0–1. Zero on an empty session rather than NaN. */
  focus: number;
  count: number;
};

export function sessionTotals(session: Session, now: number): SessionTotals {
  let work = 0;
  let broke = 0;

  for (const segment of session.segments) {
    const ms = segmentDuration(segment, now);
    if (segment.kind === 'work') work += ms;
    else broke += ms;
  }

  const total = work + broke;
  return {
    work,
    break: broke,
    total,
    focus: total === 0 ? 0 : work / total,
    count: session.segments.length,
  };
}

/**
 * Milliseconds per item across every session given.
 *
 * **These overlap and will not sum to the session total** — §2.6. Forty minutes
 * spent on two items counts forty against each, not twenty. Splitting it evenly
 * would make the columns add up and would be a fiction: you did not half-work on
 * either. Anywhere this is displayed has to say so.
 */
export function itemTotals(sessions: Session[], now: number): Map<string, number> {
  const totals = new Map<string, number>();

  for (const session of sessions) {
    for (const segment of session.segments) {
      if (segment.kind !== 'work') continue;
      const ms = segmentDuration(segment, now);
      for (const id of segment.itemIds) {
        totals.set(id, (totals.get(id) ?? 0) + ms);
      }
    }
  }

  return totals;
}

/**
 * The local calendar day an instant belongs to, as 'YYYY-MM-DD'.
 *
 * Sessions roll up by the day they *started* on, so one running 23:00 → 01:00
 * counts entirely toward the day it began — which is how anyone working late
 * thinks about it, and why this takes `startedAt` rather than a range.
 */
export function localDayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/* -------------------------------------------------------------------------- */
/* transitions — each returns a new Session                                    */
/* -------------------------------------------------------------------------- */

/** Closes whatever is live at `at`. Returns the segments unchanged if none is. */
function closeLive(segments: Segment[], at: number): Segment[] {
  return segments.map((seg) => (seg.endedAt === null ? { ...seg, endedAt: at } : seg));
}

export function startSession(now: number, id: string): Session {
  return {
    id,
    startedAt: now,
    endedAt: null,
    // The session and its first work segment open together: Start the Day means
    // start working, and choosing what happens inside it — §2.6.
    segments: [{ kind: 'work', itemIds: [], startedAt: now, endedAt: null }],
    lastSeenAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Flip between work and break: close the live segment, open one of `kind`.
 *
 * Items carry forward only on work → work. Coming back from a break starts you on
 * nothing in particular, which is the honest default — what you return to is a
 * decision, not a continuation.
 */
export function switchTo(session: Session, kind: SegmentKind, now: number): Session {
  const live = liveSegment(session);
  const carry = kind === 'work' && live?.kind === 'work' ? live.itemIds : [];

  return {
    ...session,
    segments: [
      ...closeLive(session.segments, now),
      { kind, itemIds: carry, startedAt: now, endedAt: null },
    ],
    updatedAt: now,
  };
}

/**
 * Change what you are working on.
 *
 * Per §3.5 this **closes the segment and opens a new one** rather than editing in
 * place. Editing would retroactively attribute the whole segment to items you
 * only picked up halfway through, which is exactly the number Stats must not get
 * wrong.
 */
export function setItems(session: Session, itemIds: string[], now: number): Session {
  const live = liveSegment(session);
  if (live === null) return session;

  return {
    ...session,
    segments: [
      ...closeLive(session.segments, now),
      { kind: live.kind, itemIds, startedAt: now, endedAt: null },
    ],
    updatedAt: now,
  };
}

/**
 * End the session at `at` — the live segment and the session close on the same
 * instant, so the parts always sum to the whole.
 *
 * `at` is the present for a normal End Session, and a past instant when the
 * failsafe trims a forgotten one. Segments that started after `at` are dropped:
 * they cannot have happened.
 */
export function endSession(session: Session, at: number): Session {
  const segments: Segment[] = [];

  for (const seg of session.segments) {
    if (seg.startedAt > at) continue; // it cannot have happened
    const overruns = seg.endedAt === null || seg.endedAt > at;
    segments.push(overruns ? { ...seg, endedAt: at } : seg);
  }

  return { ...session, segments, endedAt: at, updatedAt: at };
}

/* -------------------------------------------------------------------------- */
/* the forgotten-session failsafe                                              */
/* -------------------------------------------------------------------------- */

/** Work stopped when you stopped touching the machine. */
export const WORK_IDLE_MS = 10 * 60_000;

/**
 * A break is *precisely* when you are away, so absence proves nothing about it —
 * only implausible length does. An hour of lunch and errands is a real break.
 */
export const LONG_BREAK_MS = 90 * 60_000;

export type Suspicion = 'work-idle' | 'long-break';

/**
 * Whether a running session looks forgotten, and why — or `null` if it looks fine.
 *
 * Two thresholds because the two kinds of segment carry different evidence. This
 * only ever *flags*: the prompt asks, and nothing is edited without an answer.
 */
export function isSuspect(session: Session, now: number): Suspicion | null {
  if (session.endedAt !== null) return null;

  const live = liveSegment(session);
  if (live === null) return null;

  if (live.kind === 'work') {
    return now - session.lastSeenAt > WORK_IDLE_MS ? 'work-idle' : null;
  }

  return segmentDuration(live, now) > LONG_BREAK_MS ? 'long-break' : null;
}

/**
 * Why a custom end time cannot be used, or `null` if it is fine — the same shape
 * as `scheduleError`, shown inline and disabling the button.
 *
 * Bounded by the live segment's start (you cannot end a segment before it began;
 * anything earlier would mean deleting completed segments, which is a repair
 * rather than a trim) and by the present. Both edges are allowed.
 */
export function trimError(session: Session, at: number, now: number): string | null {
  if (Number.isNaN(at)) return 'That is not a time.';

  const live = liveSegment(session);
  if (live === null) return 'This session has already ended.';

  if (at < live.startedAt) return 'That is before the current segment started.';
  if (at > now) return 'That is in the future.';

  return null;
}

/* -------------------------------------------------------------------------- */
/* ranges and aggregation — what Stats is built from                           */
/* -------------------------------------------------------------------------- */

/**
 * A range of whole local days, inclusive at both ends, as 'YYYY-MM-DD' keys.
 *
 * Stats works in day keys rather than instants because **the day is the smallest
 * bucket anywhere in Stats** — §3.6. Keys are ISO, so ordering and containment are
 * plain string comparisons and no timezone arithmetic is needed to ask whether a
 * session falls inside a range.
 */
export type DayRange = { from: string; to: string };

/** Parse a 'YYYY-MM-DD' key back to local midnight. */
function fromDayKey(key: string): Date {
  const [y = 0, m = 1, d = 1] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * The week containing `now`, Monday to Sunday.
 *
 * Monday is hardcoded: §6 has `weekStartsOn` in settings, but settings are not
 * built, and inventing a second source for it now would only have to be undone.
 */
export function weekRange(now: number): DayRange {
  const d = new Date(now);
  const back = (d.getDay() + 6) % 7; // Sunday is 0; Monday should be 0
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - back);
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  return { from: localDayKey(monday.getTime()), to: localDayKey(sunday.getTime()) };
}

/** The calendar month containing `now`, first to last day. */
export function monthRange(now: number): DayRange {
  const d = new Date(now);
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { from: localDayKey(first.getTime()), to: localDayKey(last.getTime()) };
}

/** Every day key in the range, in order. Empty if the range is inverted. */
export function dayKeysIn(range: DayRange): string[] {
  const keys: string[] = [];
  let day = fromDayKey(range.from);
  const end = fromDayKey(range.to);

  // Stepping a `Date` by one day rather than adding 86_400_000 to a timestamp:
  // across a DST boundary a "day" is 23 or 25 hours, and the fixed-millisecond
  // version drifts onto the wrong date.
  while (day <= end) {
    keys.push(localDayKey(day.getTime()));
    day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
  }

  return keys;
}

/**
 * Sessions that *started* inside the range — §2.6. One running 23:00 → 01:00
 * belongs wholly to the day it began, so the range never splits a session.
 */
export function sessionsIn(sessions: Session[], range: DayRange): Session[] {
  return sessions.filter((s) => {
    const key = localDayKey(s.startedAt);
    return key >= range.from && key <= range.to;
  });
}

/** Work, break, focus and segment count across many sessions. */
export function aggregateTotals(sessions: Session[], now: number): SessionTotals {
  let work = 0;
  let broke = 0;
  let count = 0;

  for (const session of sessions) {
    const t = sessionTotals(session, now);
    work += t.work;
    broke += t.break;
    count += t.count;
  }

  const total = work + broke;
  return { work, break: broke, total, focus: total === 0 ? 0 : work / total, count };
}

/** Totals per local day, keyed by day. Days with no session are absent. */
export function dayTotals(sessions: Session[], now: number): Map<string, SessionTotals> {
  const byDay = new Map<string, Session[]>();

  for (const session of sessions) {
    const key = localDayKey(session.startedAt);
    const list = byDay.get(key);
    if (list === undefined) byDay.set(key, [session]);
    else list.push(session);
  }

  const out = new Map<string, SessionTotals>();
  for (const [key, list] of byDay) out.set(key, aggregateTotals(list, now));
  return out;
}

/**
 * Work milliseconds per project, keyed by `projectId` — `null` for work on items
 * with no project. Unattributed work (a segment carrying no items) is skipped
 * rather than invented as a project.
 *
 * **Counted per segment, not per item**, which is the difference from
 * `itemTotals`. A segment carrying two items of the *same* project is two hours on
 * that project, not four: within one project there is nothing to disambiguate, and
 * double-counting there would make a project exceed the work total it belongs to.
 * Across *different* projects it still overlaps, because that is a real ambiguity
 * about where the hour went — and the screen says so.
 */
export function projectTotals(
  sessions: Session[],
  items: Item[],
  now: number,
): Map<string | null, number> {
  const projectOf = new Map(items.map((item) => [item.id, item.projectId]));
  const totals = new Map<string | null, number>();

  for (const session of sessions) {
    for (const segment of session.segments) {
      if (segment.kind !== 'work') continue;

      const touched = new Set<string | null>();
      for (const id of segment.itemIds) {
        const projectId = projectOf.get(id);
        if (projectId !== undefined) touched.add(projectId); // the item is gone; do not guess
      }

      const ms = segmentDuration(segment, now);
      for (const projectId of touched) {
        totals.set(projectId, (totals.get(projectId) ?? 0) + ms);
      }
    }
  }

  return totals;
}

/**
 * The same sessions with every work segment not touching `projectId` removed.
 *
 * Filtering Stats by project cannot mean filtering *sessions* — one session
 * usually spans several projects. It means narrowing to the segments that carry an
 * item of that project, which is why break time and focus % stop being answerable
 * under a project filter: a break belongs to no project, and the screen says so
 * rather than showing a number that means nothing.
 */
export function onlyProject(sessions: Session[], items: Item[], projectId: string): Session[] {
  const inProject = new Set(
    items.filter((item) => item.projectId === projectId).map((item) => item.id),
  );

  return sessions.map((session) => ({
    ...session,
    segments: session.segments.filter(
      (seg) => seg.kind === 'work' && seg.itemIds.some((id) => inProject.has(id)),
    ),
  }));
}
