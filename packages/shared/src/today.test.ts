import { describe, expect, it } from 'vitest';
import { createItem } from './create';
import { todayGroup } from './today';
import type { Item } from './types';

// Midday on 15 August 2026. Tests run pinned to Europe/Istanbul (vitest.config.ts),
// so this is 15:00 local — comfortably inside the day either way.
const NOW = Date.UTC(2026, 7, 15, 12, 0);
const DAY = 24 * 60 * 60 * 1000;

const make = (over: Partial<Item>) => createItem({ title: 't', ...over }, NOW, 'id');
const group = (over: Partial<Item>) => todayGroup(make(over), NOW);

describe('todayGroup', () => {
  it('puts anything open and overdue in Missed, whatever else it is', () => {
    expect(group({ due: NOW - DAY })).toBe('missed');
    expect(group({ kind: 'event', start: NOW - 2 * DAY, end: NOW - DAY })).toBe('missed');
  });

  it('prefers Missed over Due today when an item is both', () => {
    // Due earlier today: past, so missed — and Missed is the first group on screen.
    expect(group({ due: NOW - 60_000 })).toBe('missed');
  });

  it('groups a timed event starting today under Events', () => {
    expect(group({ kind: 'event', start: NOW + 3600_000, end: NOW + 7200_000 })).toBe('events');
  });

  it('does not put a timed *task* under Events', () => {
    expect(group({ kind: 'task', start: NOW + 3600_000, end: NOW + 7200_000 })).toBe('due-today');
  });

  it('groups a deadline falling today under Due today', () => {
    expect(group({ due: NOW + 3600_000 })).toBe('due-today');
  });

  it('groups an all-day item covering today under All day', () => {
    expect(group({ allDay: true, startDate: '2026-08-15' })).toBe('all-day');
    expect(group({ allDay: true, startDate: '2026-08-13', endDate: '2026-08-18' })).toBe('all-day');
  });

  it('groups an item with no scheduling at all under Anytime', () => {
    expect(group({})).toBe('anytime');
    expect(group({ important: true, projectId: 'p1' })).toBe('anytime');
  });

  it('keeps future and past-but-resolved items off Today entirely', () => {
    expect(group({ due: NOW + 10 * DAY })).toBeNull();
    expect(
      group({ kind: 'event', start: NOW + 10 * DAY, end: NOW + 10 * DAY + 3600_000 }),
    ).toBeNull();
    expect(group({ allDay: true, startDate: '2026-09-01' })).toBeNull();
    expect(group({ due: NOW - DAY, status: 'done' })).toBeNull();
    expect(group({ due: NOW - DAY, status: 'cancelled' })).toBeNull();
  });

  it('never returns two groups for one item', () => {
    const items = [
      make({ due: NOW - DAY }),
      make({ kind: 'event', start: NOW, end: NOW + 3600_000 }),
      make({ due: NOW + 3600_000 }),
      make({ allDay: true, startDate: '2026-08-15' }),
      make({}),
    ];
    const groups = items.map((i) => todayGroup(i, NOW));
    expect(groups).toEqual(['missed', 'events', 'due-today', 'all-day', 'anytime']);
  });
});
