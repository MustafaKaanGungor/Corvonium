import { isMissed } from "./derive";
import type { Item } from "./types";

export type TimeFilter = 'all' | 'missed' | 'this-week' | 'done';

const DAY = 24 * 60 * 60 * 1000;

export function matchesTimeFilter(item: Item, now: number, filter: TimeFilter): boolean {
  switch (filter) {
    case 'done':
      return item.status === 'done';
    case 'missed':
      return isMissed(item, now);
    case 'this-week':
      return item.status === 'open' && item.due !== null && item.due <= now + 7 * DAY;
    case 'all':
      return item.status === 'open';
  }
}