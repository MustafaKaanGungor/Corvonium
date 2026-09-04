import { describe, expect, it } from 'vitest';
import { effectiveDue, endOfLocalDay, isMissed, isRoutine, isUrgent, localDate } from './derive';
import type { Item } from './types';

function makeItem(over: Partial<Item> = {}): Item {
  return {
    id: 'x',
    title: 'Test',
    notes: '',
    kind: 'task',
    allDay: false,
    start: null,
    end: null,
    startDate: null,
    endDate: null,
    due: null,
    tzid: null,
    rrule: null,
    seriesId: null,
    originalStart: null,
    status: 'open',
    completedAt: null,
    cancelledAt: null,
    projectId: null,
    location: null,
    important: false,
    sortOrder: 'a0',
    createdAt: 0,
    updatedAt: 0,
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

describe('localDate', () => {
  it('uses the local calendar day, not the UTC one', () => {
    // 22:30 UTC on the 15th is already 01:30 on the 16th in Istanbul (UTC+3)
    expect(localDate(Date.UTC(2026, 7, 15, 22, 30))).toBe('2026-08-16');
  });
});

describe('endOfLocalDay', () => {
  it('lands on the last instant of the day, in local time', () => {
    const end = endOfLocalDay('2026-08-15');
    expect(end).not.toBeNull();
    expect(localDate(end!)).toBe('2026-08-15');
    expect(localDate(end! + 1)).toBe('2026-08-16');
  });

  it('returns null for anything it cannot parse', () => {
    expect(endOfLocalDay('nonsense')).toBeNull();
    expect(endOfLocalDay('2026-08')).toBeNull();
  });
});

describe('effectiveDue', () => {
  it('prefers an explicit deadline', () => {
    expect(effectiveDue(makeItem({ due: NOW, end: NOW + DAY }))).toBe(NOW);
  });

  it('runs an all-day item to the end of its last day', () => {
    const due = effectiveDue(makeItem({ allDay: true, startDate: '2026-08-15' }));
    expect(due).toBe(endOfLocalDay('2026-08-15'));
    // Midday on the day itself is not yet late.
    expect(due! > NOW).toBe(true);
  });

  it('uses endDate over startDate for a multi-day span', () => {
    const item = makeItem({ allDay: true, startDate: '2026-08-13', endDate: '2026-08-18' });
    expect(effectiveDue(item)).toBe(endOfLocalDay('2026-08-18'));
  });

  it('falls back to a block end, and is null with nothing at all', () => {
    expect(effectiveDue(makeItem({ end: NOW + DAY }))).toBe(NOW + DAY);
    expect(effectiveDue(makeItem({}))).toBeNull();
  });
});

describe('isUrgent with all-day items', () => {
  it('treats an all-day item inside the horizon as urgent', () => {
    // Today: late tonight, so well inside a two-day window.
    expect(isUrgent(makeItem({ allDay: true, startDate: '2026-08-15' }), NOW, 2)).toBe(true);
    expect(isUrgent(makeItem({ allDay: true, startDate: '2026-08-16' }), NOW, 2)).toBe(true);
  });

  it('leaves an all-day item beyond the horizon alone', () => {
    expect(isUrgent(makeItem({ allDay: true, startDate: '2026-08-30' }), NOW, 2)).toBe(false);
  });
});
