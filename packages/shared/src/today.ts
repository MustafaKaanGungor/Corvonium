import { isMissed, localDate } from './derive';
import type { Item } from './types';

export type TodayGroup = 'missed' | 'events' | 'due-today' | 'all-day' | 'anytime';

/** True when two instants fall on the same local calendar day. */
export function isSameLocalDay(a: number, b: number): boolean {
  return localDate(a) === localDate(b);
}

/** True when `date` ('YYYY-MM-DD') falls inside an all-day span, both ends inclusive. */
function spanCovers(date: string, startDate: string | null, endDate: string | null): boolean {
  const from = startDate ?? endDate;
  if (from === null) return false;
  const to = endDate ?? startDate ?? from;
  return from <= date && date <= to;
}

/** Genuinely unscheduled: nothing anywhere that pins it to a time. */
function isUnscheduled(item: Item): boolean {
  return (
    item.due === null &&
    item.start === null &&
    item.end === null &&
    item.startDate === null &&
    item.endDate === null
  );
}

/**
 * Which Today group an item belongs in, or `null` if it does not belong on Today
 * at all — plan §3.3.
 *
 * The order of these checks is precedence, and it matters: an item that is both
 * missed and due today belongs under Missed, which is why that group is first
 * on the screen. Every item lands in at most one group.
 */
export function todayGroup(item: Item, now: number): TodayGroup | null {
  if (item.status !== 'open') return null;

  if (isMissed(item, now)) return 'missed';

  const today = localDate(now);

  if (item.allDay && spanCovers(today, item.startDate, item.endDate)) return 'all-day';

  if (item.kind === 'event' && item.start !== null && isSameLocalDay(item.start, now)) {
    return 'events';
  }

  if (item.due !== null && isSameLocalDay(item.due, now)) return 'due-today';

  // A timed task starting today still belongs on Today, under its deadline group.
  if (item.start !== null && isSameLocalDay(item.start, now)) return 'due-today';

  if (isUnscheduled(item)) return 'anytime';

  return null;
}
