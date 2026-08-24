import { isRoutine, isUrgent } from './derive';
import type { Item } from './types';

export type MatrixGroup = 'routine' | 'urgent-important' | 'important' | 'urgent' | 'neither';

/**
 * Which Task view group an item belongs in — plan §3.4.
 * Routine is exclusive: anything that recurs never reaches a quadrant.
 */
export function matrixGroup(item: Item, now: number, urgentWithinDays: number): MatrixGroup {
  if (isRoutine(item)) return 'routine';

  const urgent = isUrgent(item, now, urgentWithinDays);
  if (urgent && item.important) return 'urgent-important';
  if (item.important) return 'important';
  if (urgent) return 'urgent';
  return 'neither';
}
