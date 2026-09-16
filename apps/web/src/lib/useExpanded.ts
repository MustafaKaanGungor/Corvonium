import { useMemo } from 'react';
import { expandAll, localDate, type Item } from '@corvonium/shared';

/**
 * The list every list-shaped screen renders: repeating items expanded into their
 * occurrences — §2.4.
 *
 * Recomputed when the items change or **the date** does, not on every tick of
 * `useNow`. `expandAll` depends on `now` only through its date (its horizon edges
 * are whole days), so the same array comes back all day — which also lets the
 * memos downstream of it, like TaskView's grouping, actually hit.
 */
export function useExpanded(items: Item[] | null, now: number): Item[] | null {
  const day = localDate(now);

  return useMemo(
    () => (items === null ? null : expandAll(items, now)),
    // `now` is left out on purpose: `day` is the part of it the result depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, day],
  );
}
