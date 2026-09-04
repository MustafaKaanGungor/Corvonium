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

/**
 * The `important` value a group implies. `null` for Routine, whose membership
 * comes from `rrule` and so cannot be set by dragging.
 */
export function importantForGroup(group: MatrixGroup): boolean | null {
  switch (group) {
    case 'urgent-important':
    case 'important':
      return true;
    case 'urgent':
    case 'neither':
      return false;
    case 'routine':
      return null;
  }
}

/**
 * Groups this item could legally be dropped into.
 *
 * Only `important` is settable by dragging: `rrule` and `due` are stored data that
 * a drop cannot invent. So a recurring item can only be reordered inside Routine,
 * and every other item has exactly two homes — its current group and the one it
 * reaches by flipping `important`. Callers dim the rest during a drag so no drop
 * silently lands somewhere the user did not aim at.
 */
export function dropTargets(item: Item, now: number, urgentWithinDays: number): MatrixGroup[] {
  if (isRoutine(item)) return ['routine'];
  return [
    matrixGroup({ ...item, important: true }, now, urgentWithinDays),
    matrixGroup({ ...item, important: false }, now, urgentWithinDays),
  ];
}
