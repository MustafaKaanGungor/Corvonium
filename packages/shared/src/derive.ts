import type { Item } from './types';

export function isRoutine(item: Item): boolean {
  return item.rrule !== null;
}

export function localDate(now: number): string {
  const d = new Date(now);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

export function isMissed(item: Item, now: number): boolean {
  if (item.status !== 'open') return false;

  if (item.due != null) return item.due < now;

  if (item.allDay) {
    const lastDat = item.endDate ?? item.startDate;
    if (lastDat == null) return false;
    return lastDat < localDate(now);
  }

  return item.end != null && item.end < now;
}

export function isUrgent(item: Item, now: number, urgentWithinDays: number): boolean {
  if (item.status !== 'open') return false;
  if (item.due == null) return false;

  return item.due <= now + urgentWithinDays * 24 * 60 * 60 * 1000;
}
