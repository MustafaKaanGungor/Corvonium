import { useCallback, useSyncExternalStore } from 'react';

/**
 * Whether a CSS media query currently matches.
 *
 * `useSyncExternalStore` over `matchMedia`, the same pattern as `lib/router.ts` and
 * for the same reason: this is external mutable state, and a `useState` + effect
 * pair renders one frame behind it.
 *
 * Used where the two layouts cannot simply be CSS-hidden — Tasks mounts either the
 * stacked column or the 2×2, never both, because dnd-kit resolves sortable ids
 * globally and a hidden duplicate would steal drops.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [query],
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false, // no window to measure: assume the phone layout
  );
}

/** The shell breakpoint — matches Tailwind's `md:`. */
export const DESKTOP = '(min-width: 768px)';
