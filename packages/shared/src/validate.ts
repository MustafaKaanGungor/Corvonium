import { anchorOf } from './recurrence';
import type { Item } from './types';

/** What the schedule section of the item form can produce. */
export type SchedulePart = Pick<Item, 'allDay' | 'start' | 'end' | 'startDate' | 'endDate'>;

/**
 * A reason the schedule cannot be saved, or `null` if it is fine.
 *
 * The form shows this inline and disables Save on it, so an item can never reach
 * the database describing a span that ends before it begins.
 */
export function scheduleError(part: SchedulePart): string | null {
  if (part.allDay) {
    if (part.startDate === null) return 'Pick a date for the all-day item.';
    if (part.endDate !== null && part.endDate < part.startDate) {
      return 'The last day is before the first day.';
    }
    return null;
  }

  // A timed block: both ends, in order. One end alone is a half-written block.
  if (part.start !== null && part.end === null) return 'Add an end time, or clear the start.';
  if (part.end !== null && part.start === null) return 'Add a start time, or clear the end.';
  if (part.start !== null && part.end !== null && part.end <= part.start) {
    return 'It ends before it starts.';
  }

  return null;
}

/**
 * A reason a recurrence rule cannot be saved, or `null` if it is fine.
 *
 * A rule needs something to count from: "every Monday" starting nowhere has no
 * first occurrence and would expand to nothing, silently.
 */
export function recurrenceError(
  item: Pick<Item, 'rrule' | 'start' | 'due' | 'startDate'>,
): string | null {
  if (item.rrule === null) return null;
  if (anchorOf(item as Item) === null) return 'Give it a date or a deadline to repeat from.';
  return null;
}
