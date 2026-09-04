import type { Item } from './types';

export function isRoutine(item: Item): boolean {
  return item.rrule !== null;
}

/** The local calendar date as 'YYYY-MM-DD'. All-day items are dates, not instants. */
export function localDate(now: number): string {
  const d = new Date(now);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

/** The last instant of a 'YYYY-MM-DD' day, in local time. `null` if unparseable. */
export function endOfLocalDay(isoDate: string): number | null {
  const parts = isoDate.split('-').map(Number);
  if (parts.length !== 3) return null;

  const [year, month, day] = parts;
  if (year === undefined || month === undefined || day === undefined) return null;
  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) return null;

  return new Date(year, month - 1, day, 23, 59, 59, 999).getTime();
}

/**
 * The moment an item becomes late — the single clock reading every time rule uses.
 *
 * An all-day item runs to the *end* of its last day: something dated today is not
 * late at 09:00. Without this, date-based items carry no deadline at all and fall
 * silently out of every rule that asks about time.
 *
 * Precedence: an explicit deadline wins, then an all-day span, then a block's end.
 */
export function effectiveDue(item: Item): number | null {
  if (item.due !== null) return item.due;

  if (item.allDay) {
    const lastDay = item.endDate ?? item.startDate;
    return lastDay === null ? null : endOfLocalDay(lastDay);
  }

  return item.end;
}

/** Open, and its time has passed. Never stored — see plan §2.2. */
export function isMissed(item: Item, now: number): boolean {
  if (item.status !== 'open') return false;
  const due = effectiveDue(item);
  return due !== null && due < now;
}

/**
 * Deadline inside the horizon. Overdue items count as urgent too — they satisfy
 * `due <= now + horizon` trivially.
 */
export function isUrgent(item: Item, now: number, urgentWithinDays: number): boolean {
  if (item.status !== 'open') return false;
  const due = effectiveDue(item);
  return due !== null && due <= now + urgentWithinDays * 24 * 60 * 60 * 1000;
}
