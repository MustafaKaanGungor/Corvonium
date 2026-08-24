import { describe, expect, it } from 'vitest';
import { createItem } from './create';
import { matrixGroup } from './grouping';
import type { Item } from './types';

const NOW = Date.UTC(2026, 7, 15, 12, 0);
const DAY = 24 * 60 * 60 * 1000;
const make = (over: Partial<Item>) => createItem({ title: 't', ...over }, NOW, 'id');
const group = (over: Partial<Item>) => matrixGroup(make(over), NOW, 2);

describe('matrixGroup', () => {
  it('sends anything recurring to Routine, whatever else is true of it', () => {
    expect(group({ rrule: 'FREQ=DAILY' })).toBe('routine');
    expect(group({ rrule: 'FREQ=MONTHLY', important: true, due: NOW })).toBe('routine');
  });

  it('places the four quadrants', () => {
    expect(group({ important: true, due: NOW + DAY })).toBe('urgent-important');
    expect(group({ important: true, due: NOW + 10 * DAY })).toBe('important');
    expect(group({ important: true })).toBe('important');
    expect(group({ due: NOW + DAY })).toBe('urgent');
    expect(group({})).toBe('neither');
  });

  it('moves an item between quadrants as its deadline approaches', () => {
    const item = make({ important: true, due: NOW + 10 * DAY });
    expect(matrixGroup(item, NOW, 2)).toBe('important');
    expect(matrixGroup(item, NOW + 9 * DAY, 2)).toBe('urgent-important');
  });
});
