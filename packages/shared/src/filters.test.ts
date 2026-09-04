import { describe, expect, it } from 'vitest';
import { createItem } from './create';
import { matchesProjectFilter, matchesTimeFilter } from './filters';
import type { Item } from './types';

const NOW = Date.UTC(2026, 7, 15, 12, 0);
const DAY = 24 * 60 * 60 * 1000;
const make = (over: Partial<Item>) => createItem({ title: 't', ...over }, NOW, 'id');

describe('matchesTimeFilter', () => {
  it('all: open items only', () => {
    expect(matchesTimeFilter(make({}), NOW, 'all')).toBe(true);
    expect(matchesTimeFilter(make({ status: 'done' }), NOW, 'all')).toBe(false);
  });

  it('done: anything resolved — the way back from a mistaken tap', () => {
    expect(matchesTimeFilter(make({ status: 'done' }), NOW, 'done')).toBe(true);
    expect(matchesTimeFilter(make({ status: 'cancelled' }), NOW, 'done')).toBe(true);
    expect(matchesTimeFilter(make({}), NOW, 'done')).toBe(false);
  });

  it('missed: open and past its deadline', () => {
    expect(matchesTimeFilter(make({ due: NOW - DAY }), NOW, 'missed')).toBe(true);
    expect(matchesTimeFilter(make({ due: NOW + DAY }), NOW, 'missed')).toBe(false);
  });

  it('project filter: null lets everything through, including unassigned items', () => {
    expect(matchesProjectFilter(make({ projectId: 'p1' }), null)).toBe(true);
    expect(matchesProjectFilter(make({ projectId: null }), null)).toBe(true);
  });

  it('project filter: an id matches only that project', () => {
    expect(matchesProjectFilter(make({ projectId: 'p1' }), 'p1')).toBe(true);
    expect(matchesProjectFilter(make({ projectId: 'p2' }), 'p1')).toBe(false);
    expect(matchesProjectFilter(make({ projectId: null }), 'p1')).toBe(false);
  });

  it('this-week: due inside seven days, overdue included', () => {
    expect(matchesTimeFilter(make({ due: NOW + 3 * DAY }), NOW, 'this-week')).toBe(true);
    expect(matchesTimeFilter(make({ due: NOW - 3 * DAY }), NOW, 'this-week')).toBe(true);
    expect(matchesTimeFilter(make({ due: NOW + 30 * DAY }), NOW, 'this-week')).toBe(false);
    expect(matchesTimeFilter(make({}), NOW, 'this-week')).toBe(false);
  });
});

describe('matchesTimeFilter with all-day items', () => {
  it('this-week includes an all-day item dated inside the window', () => {
    const item = make({ allDay: true, startDate: '2026-08-18' });
    expect(matchesTimeFilter(item, NOW, 'this-week')).toBe(true);
  });

  it('this-week excludes one beyond the window', () => {
    const item = make({ allDay: true, startDate: '2026-09-30' });
    expect(matchesTimeFilter(item, NOW, 'this-week')).toBe(false);
  });

  it('missed catches an all-day item whose last day has passed', () => {
    const item = make({ allDay: true, startDate: '2026-08-13', endDate: '2026-08-14' });
    expect(matchesTimeFilter(item, NOW, 'missed')).toBe(true);
  });
});
