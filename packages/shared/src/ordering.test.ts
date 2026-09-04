import { describe, expect, it } from 'vitest';
import { keyAtIndex, keyAtTop, keyBetween, keyForReorder } from './ordering';

/** The guarantee the whole design rests on: plain `<`, never localeCompare. */
const sorted = (keys: string[]) => keys.toSorted((a, b) => (a < b ? -1 : a > b ? 1 : 0));

describe('keyBetween', () => {
  it('produces a key that sorts between its neighbours', () => {
    const a = keyBetween(null, null);
    const c = keyBetween(a, null);
    const b = keyBetween(a, c);
    expect(sorted([c, a, b])).toEqual([a, b, c]);
  });

  it('stays strictly ordered when repeatedly splitting the same gap', () => {
    let low = keyBetween(null, null);
    const high = keyBetween(low, null);
    const keys = [low];
    for (let i = 0; i < 20; i++) {
      low = keyBetween(low, high);
      keys.push(low);
    }
    keys.push(high);
    expect(sorted(keys)).toEqual(keys);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('keyAtTop', () => {
  it('sorts before everything that exists', () => {
    const a = keyBetween(null, null);
    const b = keyBetween(a, null);
    const top = keyAtTop([b, a]);
    expect(sorted([a, b, top])).toEqual([top, a, b]);
  });

  it('works on an empty list', () => {
    expect(typeof keyAtTop([])).toBe('string');
  });
});

describe('keyAtIndex', () => {
  it('places at the front, the middle and the end', () => {
    const a = keyBetween(null, null);
    const b = keyBetween(a, null);
    const c = keyBetween(b, null);
    const list = [a, b, c];

    expect(sorted([...list, keyAtIndex(list, 0)])[0]).toBe(keyAtIndex(list, 0));
    expect(sorted([...list, keyAtIndex(list, 3)])[3]).toBe(keyAtIndex(list, 3));

    const middle = keyAtIndex(list, 1);
    expect(sorted([...list, middle])).toEqual([a, middle, b, c]);
  });

  it('works on an empty list', () => {
    expect(typeof keyAtIndex([], 0)).toBe('string');
  });
});

describe('keyForReorder', () => {
  const a = keyBetween(null, null);
  const b = keyBetween(a, null);
  const c = keyBetween(b, null);
  const list = [a, b, c];

  it('moves the first item to the end', () => {
    const moved = keyForReorder(list, 0, 2);
    expect(sorted([b, c, moved])).toEqual([b, c, moved]);
  });

  it('moves the last item to the front', () => {
    const moved = keyForReorder(list, 2, 0);
    expect(sorted([a, b, moved])).toEqual([moved, a, b]);
  });

  it('moves a middle item down by one', () => {
    // [a, b, c] with b lifted out is [a, c]; index 1 puts it back between them
    const moved = keyForReorder(list, 1, 1);
    expect(sorted([a, c, moved])).toEqual([a, moved, c]);
  });

  it('handles a single-item list', () => {
    expect(typeof keyForReorder([a], 0, 0)).toBe('string');
  });
});
