import { describe, expect, it } from 'vitest';
import { expandSeries, occurrenceAt } from './recurrence';
import type { Item } from './types';

/**
 * Recurrence across a clock change.
 *
 * This file runs under `TZ=Europe/London` — see `vitest.config.ts`. Everything
 * else in the suite runs in Europe/Istanbul, which has been on permanent GMT+3
 * since 2016 and therefore **cannot** exercise DST at all. Recurrence is the one
 * place in the app where that gap actually matters, so it gets its own zone.
 *
 * The bug being guarded against: expanding a rule in UTC, or stepping days by
 * adding 86_400_000, moves a 09:00 routine to 08:00 or 10:00 after the clocks go
 * forward. `recurrence.ts` avoids it by expanding dates only and shifting whole
 * calendar days.
 *
 * British Summer Time in 2026: begins 29 March, ends 25 October.
 */

const at = (y: number, m: number, d: number, h = 9) => new Date(y, m - 1, d, h, 0, 0, 0).getTime();

function item(over: Partial<Item> = {}): Item {
  return {
    id: 'i1',
    title: 'Morning run',
    notes: '',
    kind: 'task',
    allDay: false,
    start: null,
    end: null,
    startDate: null,
    endDate: null,
    due: at(2026, 3, 27),
    tzid: null,
    rrule: 'FREQ=DAILY',
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

describe('the zone actually changes its clocks', () => {
  it('is on GMT before the change and BST after, or these tests prove nothing', () => {
    expect(new Date(at(2026, 3, 27)).getTimezoneOffset()).toBe(0);
    expect(new Date(at(2026, 3, 31)).getTimezoneOffset()).toBe(-60);
  });
});

describe('daily recurrence across the spring forward', () => {
  const days = expandSeries(item(), [], at(2026, 3, 27), at(2026, 4, 1));

  it('produces one occurrence per calendar day, without losing or repeating one', () => {
    expect(days.map((o) => new Date(o.due ?? 0).getDate())).toEqual([27, 28, 29, 30, 31, 1]);
  });

  it('keeps every occurrence at 09:00 local, on both sides of the change', () => {
    for (const o of days) expect(new Date(o.due ?? 0).getHours()).toBe(9);
  });
});

describe('daily recurrence across the autumn back', () => {
  const days = expandSeries(
    item({ due: at(2026, 10, 23) }),
    [],
    at(2026, 10, 23),
    at(2026, 10, 28),
  );

  it('produces one occurrence per calendar day', () => {
    expect(days.map((o) => new Date(o.due ?? 0).getDate())).toEqual([23, 24, 25, 26, 27, 28]);
  });

  it('keeps every occurrence at 09:00 local', () => {
    for (const o of days) expect(new Date(o.due ?? 0).getHours()).toBe(9);
  });
});

describe('weekly recurrence spanning the change', () => {
  it('stays on the same weekday and the same hour', () => {
    // Anchored Friday 27 March, before the change; the clocks move that weekend.
    const weeks = expandSeries(
      item({ rrule: 'FREQ=WEEKLY' }),
      [],
      at(2026, 3, 27),
      at(2026, 4, 18),
    );

    for (const o of weeks) {
      expect(new Date(o.due ?? 0).getDay()).toBe(5); // Friday
      expect(new Date(o.due ?? 0).getHours()).toBe(9);
    }
  });
});

describe('occurrenceAt across the change', () => {
  it('shifts by calendar days, not by a fixed number of milliseconds', () => {
    const series = item();
    const fourDaysLater = occurrenceAt(series, at(2026, 3, 31));

    expect(new Date(fourDaysLater.due ?? 0).getHours()).toBe(9);
    // The naive version: 4 * 86_400_000 lands at 10:00 once BST begins.
    expect(fourDaysLater.due).not.toBe(at(2026, 3, 27) + 4 * 86_400_000);
  });
});
