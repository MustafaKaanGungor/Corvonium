export type ItemKind = 'task' | 'event';
export type ItemStatus = 'open' | 'done' | 'cancelled';

export interface Item {
  id: string;
  title: string;
  notes: string;
  kind: ItemKind;

  // scheduling — any combination, all optional
  allDay: boolean;
  start: number | null; // epoch ms, timed block begins
  end: number | null; // epoch ms, timed block ends
  startDate: string | null; // 'YYYY-MM-DD', all-day — a date, not an instant
  endDate: string | null; // 'YYYY-MM-DD', inclusive
  due: number | null; // epoch ms, deadline
  tzid: string | null;

  // recurrence
  rrule: string | null;
  seriesId: string | null;
  originalStart: number | null;

  // status
  status: ItemStatus;
  completedAt: number | null;
  cancelledAt: number | null;

  // organisation
  projectId: string | null;
  location: string | null;
  important: boolean;
  sortOrder: string; // fractional index, not a number

  createdAt: number;
  updatedAt: number;
}

export interface Project {
  id: string;
  name: string;
  color: string;
  archived: boolean;
  sortOrder: string;
  createdAt: number;
  updatedAt: number;
}

export type SegmentKind = 'work' | 'break';

/** One uninterrupted run of either work or break inside a session — §2.6. */
export interface Segment {
  kind: SegmentKind;
  /** What was being worked on. A list: working on two things at once is normal. */
  itemIds: string[];
  startedAt: number;
  endedAt: number | null; // null on the live segment
}

/**
 * One continuous stretch of working, from Start the Day to End Session.
 *
 * No stored totals — no duration, no work/break sums, no focus percentage, no
 * segment count. All of it is arithmetic over `segments`, computed on read, so
 * no total can ever disagree with its own parts.
 */
export interface Session {
  id: string;
  startedAt: number;
  endedAt: number | null; // null while running
  segments: Segment[];
  /**
   * When the app last knew you were there — written once a minute while Work Mode
   * is open and visible. Device-local bookkeeping for the forgotten-session
   * failsafe, not a fact about the session; Phase 2 should not sync it.
   */
  lastSeenAt: number;
  createdAt: number;
  updatedAt: number;
}
