import { effectiveDue, isMissed } from './derive';
import type { Item } from './types';

export type TimeFilter = 'all' | 'missed' | 'this-week' | 'done';

const DAY = 24 * 60 * 60 * 1000;

export function matchesTimeFilter(item: Item, now: number, filter: TimeFilter): boolean {
  switch (filter) {
    // "Done" means resolved — finished or written off. Cancelled items must be
    // reachable somewhere, or cancelling would be a one-way door.
    case 'done':
      return item.status !== 'open';
    case 'missed':
      return isMissed(item, now);
    case 'this-week': {
      if (item.status !== 'open') return false;
      // effectiveDue, not `due`: an all-day item this week has no `due` at all.
      const due = effectiveDue(item);
      return due !== null && due <= now + 7 * DAY;
    }
    case 'all':
      return item.status === 'open';
  }
}

/**
 * Task view's project axis — plan §3.4. Combines with the time filter.
 * `null` means *every* project, not "items without a project".
 */
export function matchesProjectFilter(item: Item, projectId: string | null): boolean {
  return projectId === null || item.projectId === projectId;
}
