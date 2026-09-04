import { generateKeyBetween } from 'fractional-indexing';

/**
 * Manual ordering keys — plan §6.
 *
 * `sortOrder` is a string rather than a number so that two devices reordering the
 * same list produce keys *between* their neighbours instead of colliding integers.
 * Nothing is ever renumbered, so a reorder is a one-document write and
 * last-write-wins cannot scramble the list.
 *
 * Keys compare with plain `<`, never `localeCompare` — the guarantee is
 * lexicographic by character code, which locale collation rules do not respect.
 */

/** A key sorting strictly between `before` and `after`. `null` means an open end. */
export function keyBetween(before: string | null, after: string | null): string {
  return generateKeyBetween(before, after);
}

/** A key sorting before everything in `existing`. New items enter at the top — §3.4. */
export function keyAtTop(existing: string[]): string {
  const lowest = existing.reduce<string | null>(
    (min, key) => (min === null || key < min ? key : min),
    null,
  );
  return keyBetween(null, lowest);
}

/**
 * A key placing an item at `index` within `ordered`.
 * `ordered` must not contain the item being placed.
 */
export function keyAtIndex(ordered: string[], index: number): string {
  const before = index > 0 ? (ordered[index - 1] ?? null) : null;
  const after = ordered[index] ?? null;
  return keyBetween(before, after);
}
