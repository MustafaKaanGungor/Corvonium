import {describe, expect, it} from 'vitest';
import {isRoutine, isMissed, isUrgent} from './derive';
import type {Item} from './types';

function makeItem(over: Partial<Item> = {}): Item {
    return {
    id: 'x', title: 'Test', notes: '', kind: 'task',
    allDay: false, start: null, end: null, startDate: null, endDate: null,
    due: null, tzid: null,
    rrule: null, seriesId: null, originalStart: null,
    status: 'open', completedAt: null, cancelledAt: null,
    projectId: null, tags: [], location: null, important: false, sortOrder: 'a0',
    createdAt: 0, updatedAt: 0, deleted: false,
    ...over,
  };
}

const NOW = Date.UTC(2026, 7, 15, 12, 0);
const DAY = 24 * 60 * 60 * 1000;

describe('isRoutine', () => {
  it('is true for anything that recurs, at any frequency', () => {
    expect(isRoutine(makeItem({ rrule: 'FREQ=DAILY' }))).toBe(true);
    expect(isRoutine(makeItem({ rrule: 'FREQ=DAILY;INTERVAL=2' }))).toBe(true);
    expect(isRoutine(makeItem({ rrule: 'FREQ=MONTHLY' }))).toBe(true);
  });

  it('is false when there is no rule', () => {
    expect(isRoutine(makeItem())).toBe(false);
  });
});

describe('isMissed', () => {
    it('catches an all-day item whose last day has passed', () => {
    const item = makeItem({ allDay: true, startDate: '2026-08-13', endDate: '2026-08-14' });
    expect(isMissed(item, NOW)).toBe(true);
  });

  it('leaves an all-day item alone while it is still running', () => {
    const item = makeItem({ allDay: true, startDate: '2026-08-13', endDate: '2026-08-18' });
    expect(isMissed(item, NOW)).toBe(false);
  });

    it('handles a single-day all-day item with no end date', () => {
    expect(isMissed(makeItem({ allDay: true, startDate: '2026-08-14' }), NOW)).toBe(true);
    expect(isMissed(makeItem({ allDay: true, startDate: '2026-08-15' }), NOW)).toBe(false);
  });

  it('is true for an open item whose deadline has passed', () => {
    expect(isMissed(makeItem({ due: NOW - DAY }), NOW)).toBe(true);
  });

  it('is false once the item is done or cancelled', () => {
    expect(isMissed(makeItem({ due: NOW - DAY, status: 'done' }), NOW)).toBe(false);
    expect(isMissed(makeItem({ due: NOW - DAY, status: 'cancelled' }), NOW)).toBe(false);
  });

  it('is false for an undated item, however old', () => {
    expect(isMissed(makeItem({ createdAt: NOW - 100 * DAY }), NOW)).toBe(false);
  });

  it('lets the deadline win over a past block', () => {
    // block was Tuesday, deadline is Friday: not missed on Wednesday
    const item = makeItem({ start: NOW - 2 * DAY, end: NOW - DAY, due: NOW + 2 * DAY });
    expect(isMissed(item, NOW)).toBe(false);
  });
});

describe('isUrgent', () => {
  it('is true inside the horizon', () => {
    expect(isUrgent(makeItem({ due: NOW + DAY }), NOW, 2)).toBe(true);
  });

  it('is false outside it', () => {
    expect(isUrgent(makeItem({ due: NOW + 5 * DAY }), NOW, 2)).toBe(false);
  });

  it('counts overdue items as urgent', () => {
    expect(isUrgent(makeItem({ due: NOW - DAY }), NOW, 2)).toBe(true);
  });

  it('is false without a due date — urgency is a fact about deadlines', () => {
    expect(isUrgent(makeItem({ important: true }), NOW, 2)).toBe(false);
  });
});