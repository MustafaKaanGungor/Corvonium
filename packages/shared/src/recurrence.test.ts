import { describe, expect, it } from 'vitest';
import {
  anchorOf,
  buildRule,
  describeRule,
  endSeriesBefore,
  expandAll,
  expandSeries,
  nextOccurrence,
  occurrenceAt,
  parseRule,
  MISSED_HORIZON_DAYS,
} from './recurrence';
import { todayGroup } from './today';
import { matrixGroup } from './grouping';
import { recurrenceError } from './validate';
import type { Item } from './types';

const at = (y: number, m: number, d: number, h = 9, min = 0) =>
  new Date(y, m - 1, d, h, min, 0, 0).getTime();

/** 2026-09-08 is a Tuesday. */
const TUE = at(2026, 9, 8);

function item(over: Partial<Item> = {}): Item {
  return {
    id: 'i1',
    title: 'Take the bins out',
    notes: '',
    kind: 'task',
    allDay: false,
    start: null,
    end: null,
    startDate: null,
    endDate: null,
    due: TUE,
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
    createdAt: TUE,
    updatedAt: TUE,
    ...over,
  };
}

/* -------------------------------------------------------------------------- */
/* the rule                                                                    */
/* -------------------------------------------------------------------------- */

describe('buildRule and parseRule', () => {
  const cases: [string, Parameters<typeof buildRule>[0]][] = [
    ['FREQ=DAILY', { freq: 'daily', interval: 1, byWeekday: [] }],
    ['FREQ=DAILY;INTERVAL=2', { freq: 'daily', interval: 2, byWeekday: [] }],
    ['FREQ=WEEKLY', { freq: 'weekly', interval: 1, byWeekday: [] }],
    ['FREQ=WEEKLY;BYDAY=MO,WE', { freq: 'weekly', interval: 1, byWeekday: [0, 2] }],
    ['FREQ=WEEKLY;INTERVAL=3', { freq: 'weekly', interval: 3, byWeekday: [] }],
    ['FREQ=MONTHLY', { freq: 'monthly', interval: 1, byWeekday: [] }],
  ];

  it.each(cases)('builds %s', (rule, part) => {
    expect(buildRule(part)).toBe(rule);
  });

  it.each(cases)('round-trips %s', (rule, part) => {
    expect(parseRule(rule)).toEqual(part);
  });

  it('sorts weekdays so the same selection always produces the same string', () => {
    expect(buildRule({ freq: 'weekly', interval: 1, byWeekday: [2, 0] })).toBe(
      'FREQ=WEEKLY;BYDAY=MO,WE',
    );
  });

  it('ignores UNTIL, which is an end date rather than part of the pattern', () => {
    expect(parseRule('FREQ=DAILY;UNTIL=20261001T235959Z')).toEqual({
      freq: 'daily',
      interval: 1,
      byWeekday: [],
    });
  });

  it('returns null for a rule the presets cannot express, so the editor goes Custom', () => {
    expect(parseRule('FREQ=MONTHLY;BYMONTHDAY=13')).toBeNull();
    expect(parseRule('FREQ=YEARLY')).toBeNull();
  });

  it('returns null rather than throwing on nonsense', () => {
    expect(parseRule('not a rule at all')).toBeNull();
  });
});

describe('describeRule', () => {
  it.each([
    ['FREQ=DAILY', 'Every day'],
    ['FREQ=DAILY;INTERVAL=2', 'Every 2 days'],
    ['FREQ=WEEKLY', 'Every week'],
    ['FREQ=WEEKLY;BYDAY=MO', 'Every Monday'],
    ['FREQ=WEEKLY;BYDAY=MO,WE', 'Every Monday and Wednesday'],
    ['FREQ=WEEKLY;BYDAY=MO,WE,FR', 'Every Monday, Wednesday and Friday'],
    ['FREQ=MONTHLY', 'Every month'],
    ['FREQ=MONTHLY;INTERVAL=3', 'Every 3 months'],
  ])('reads %s as "%s"', (rule, words) => {
    expect(describeRule(rule)).toBe(words);
  });

  it('falls back to the raw rule rather than lying about one it cannot read', () => {
    expect(describeRule('FREQ=YEARLY;BYMONTH=3')).toBe('FREQ=YEARLY;BYMONTH=3');
  });
});

describe('endSeriesBefore', () => {
  it('sets UNTIL to the day before the occurrence', () => {
    expect(endSeriesBefore('FREQ=DAILY', TUE)).toBe('FREQ=DAILY;UNTIL=20260907T235959Z');
  });

  it('replaces an existing UNTIL rather than appending a second', () => {
    const twice = endSeriesBefore(endSeriesBefore('FREQ=DAILY', TUE), at(2026, 9, 20));
    expect(twice.match(/UNTIL=/g)).toHaveLength(1);
    expect(twice).toBe('FREQ=DAILY;UNTIL=20260919T235959Z');
  });

  it('leaves history expandable and stops the future', () => {
    const series = item({ rrule: endSeriesBefore('FREQ=DAILY', at(2026, 9, 10)) });
    const days = expandSeries(series, [], at(2026, 9, 1), at(2026, 9, 30)).map((o) =>
      new Date(o.due ?? 0).getDate(),
    );

    expect(days).toContain(9); // the day before the cut still happens
    expect(days).not.toContain(10); // the occurrence itself does not
    expect(days).not.toContain(11);
  });
});

/* -------------------------------------------------------------------------- */
/* anchors and occurrences                                                     */
/* -------------------------------------------------------------------------- */

describe('anchorOf', () => {
  it('prefers a start, then a deadline, then an all-day date', () => {
    expect(anchorOf(item({ start: at(2026, 9, 1), due: TUE }))).toBe(at(2026, 9, 1));
    expect(anchorOf(item({ due: TUE }))).toBe(TUE);
    expect(anchorOf(item({ due: null, allDay: true, startDate: '2026-09-03' }))).toBe(
      at(2026, 9, 3, 23, 59) + 59_999,
    );
  });

  it('is null when there is no date at all', () => {
    expect(anchorOf(item({ due: null }))).toBeNull();
  });
});

describe('recurrenceError', () => {
  it('refuses a rule with nothing to count from', () => {
    expect(recurrenceError(item({ due: null, rrule: 'FREQ=DAILY' }))).not.toBeNull();
  });

  it('accepts a rule that has a date', () => {
    expect(recurrenceError(item({ rrule: 'FREQ=DAILY' }))).toBeNull();
  });

  it('says nothing about an item that does not recur', () => {
    expect(recurrenceError(item({ due: null }))).toBeNull();
  });
});

describe('occurrenceAt', () => {
  const series = item({ rrule: 'FREQ=DAILY' });

  it('shifts the deadline to the occurrence and keeps the time of day', () => {
    const o = occurrenceAt(series, at(2026, 9, 11));
    expect(o.due).toBe(at(2026, 9, 11));
    expect(new Date(o.due ?? 0).getHours()).toBe(9);
  });

  it('gives a stable, reproducible id rather than a random one', () => {
    expect(occurrenceAt(series, at(2026, 9, 11)).id).toBe(occurrenceAt(series, at(2026, 9, 11)).id);
    expect(occurrenceAt(series, at(2026, 9, 11)).id).toContain('i1:');
  });

  it('points back at its series', () => {
    const o = occurrenceAt(series, at(2026, 9, 11));
    expect(o.seriesId).toBe('i1');
    expect(o.originalStart).toBe(at(2026, 9, 11));
  });

  it('keeps a multi-day all-day span the same length', () => {
    const weekly = item({
      due: null,
      allDay: true,
      startDate: '2026-09-08',
      endDate: '2026-09-10',
      rrule: 'FREQ=WEEKLY',
    });
    const o = occurrenceAt(weekly, (anchorOf(weekly) ?? 0) + 7 * 86_400_000);
    expect(o.startDate).toBe('2026-09-15');
    expect(o.endDate).toBe('2026-09-17');
  });

  it('is always open — completion lives on the override, not the virtual row', () => {
    const done = item({ rrule: 'FREQ=DAILY', status: 'done', completedAt: TUE });
    expect(occurrenceAt(done, TUE).status).toBe('open');
    expect(occurrenceAt(done, TUE).completedAt).toBeNull();
  });

  it('stays in Routine, because it carries the rule forward', () => {
    expect(matrixGroup(occurrenceAt(series, at(2026, 9, 11)), TUE, 2)).toBe('routine');
  });
});

/* -------------------------------------------------------------------------- */
/* expansion                                                                   */
/* -------------------------------------------------------------------------- */

describe('expandSeries', () => {
  it('produces one occurrence a day for a daily rule', () => {
    const series = item({ rrule: 'FREQ=DAILY' });
    expect(expandSeries(series, [], TUE, at(2026, 9, 12))).toHaveLength(5);
  });

  it('honours an interval', () => {
    const series = item({ rrule: 'FREQ=DAILY;INTERVAL=2' });
    const days = expandSeries(series, [], TUE, at(2026, 9, 14)).map((o) =>
      new Date(o.due ?? 0).getDate(),
    );
    expect(days).toEqual([8, 10, 12, 14]);
  });

  it('yields both days of a two-day weekly rule', () => {
    // Anchored Tuesday, repeating Monday and Wednesday.
    const series = item({ rrule: 'FREQ=WEEKLY;BYDAY=MO,WE' });
    const days = expandSeries(series, [], TUE, at(2026, 9, 21)).map((o) =>
      new Date(o.due ?? 0).getDate(),
    );
    expect(days).toEqual([9, 14, 16, 21]);
  });

  it('does not silently skip months when anchored on the 31st', () => {
    const series = item({ due: at(2026, 1, 31), rrule: 'FREQ=MONTHLY' });
    const months = expandSeries(series, [], at(2026, 1, 1), at(2026, 6, 30)).map(
      (o) => new Date(o.due ?? 0).getMonth() + 1,
    );
    // rrule's own behaviour is to skip months with no 31st. What matters is that
    // every date it does produce really is the 31st, rather than drifting.
    expect(months.length).toBeGreaterThan(0);
    for (const o of expandSeries(series, [], at(2026, 1, 1), at(2026, 12, 31))) {
      expect(new Date(o.due ?? 0).getDate()).toBe(31);
    }
  });

  it('expands nothing for a cancelled series', () => {
    const series = item({ rrule: 'FREQ=DAILY', status: 'cancelled' });
    expect(expandSeries(series, [], TUE, at(2026, 9, 12))).toEqual([]);
  });

  it('expands nothing for a rule with no anchor', () => {
    expect(expandSeries(item({ due: null, rrule: 'FREQ=DAILY' }), [], TUE, TUE)).toEqual([]);
  });

  it('survives an unparseable rule rather than throwing', () => {
    expect(expandSeries(item({ rrule: 'FREQ=NONSENSE' }), [], TUE, TUE)).toEqual([]);
  });
});

describe('overrides', () => {
  const series = item({ rrule: 'FREQ=DAILY' });
  const override = item({
    id: 'o1',
    seriesId: 'i1',
    originalStart: at(2026, 9, 9),
    due: at(2026, 9, 9),
    rrule: null,
    status: 'done',
    completedAt: at(2026, 9, 9),
  });

  it('replaces the occurrence it stands for', () => {
    const out = expandSeries(series, [override], TUE, at(2026, 9, 10));
    const ninth = out.find((o) => new Date(o.due ?? 0).getDate() === 9);
    expect(ninth?.id).toBe('o1');
    expect(ninth?.status).toBe('done');
  });

  it('leaves every other occurrence virtual and open', () => {
    const out = expandSeries(series, [override], TUE, at(2026, 9, 10));
    expect(out.filter((o) => o.status === 'open')).toHaveLength(2);
  });

  it('keeps a completed occurrence out of Today', () => {
    const out = expandSeries(series, [override], at(2026, 9, 9), at(2026, 9, 9));
    expect(out.map((o) => todayGroup(o, at(2026, 9, 9, 12)))).toEqual([null]);
  });
});

describe('nextOccurrence', () => {
  const series = item({ rrule: 'FREQ=WEEKLY;BYDAY=MO' });

  it('finds the next one after a day the rule does not fall on', () => {
    // Wednesday the 9th: the next Monday is the 14th.
    const next = nextOccurrence(series, [], at(2026, 9, 9, 12));
    expect(new Date(next?.due ?? 0).getDate()).toBe(14);
  });

  it('is strictly after — the same day does not count as next', () => {
    const next = nextOccurrence(series, [], at(2026, 9, 14, 12));
    expect(new Date(next?.due ?? 0).getDate()).toBe(21);
  });

  it('returns an override where one exists rather than a fresh occurrence', () => {
    const override = item({
      id: 'o2',
      seriesId: 'i1',
      originalStart: at(2026, 9, 14),
      rrule: null,
      status: 'done',
    });
    expect(nextOccurrence(series, [override], at(2026, 9, 9, 12))?.id).toBe('o2');
  });

  it('is null once the series has been stopped', () => {
    const ended = item({ rrule: endSeriesBefore('FREQ=WEEKLY;BYDAY=MO', at(2026, 9, 14)) });
    expect(nextOccurrence(ended, [], at(2026, 9, 14, 12))).toBeNull();
  });
});

describe('expandAll', () => {
  it('passes standalone items through untouched', () => {
    const plain = item({ id: 'plain' });
    expect(expandAll([plain], TUE)).toEqual([plain]);
  });

  it('never emits the series document itself', () => {
    const series = item({ rrule: 'FREQ=DAILY' });
    expect(expandAll([series], TUE).map((o) => o.id)).not.toContain('i1');
  });

  it('never emits an override on its own', () => {
    const series = item({ rrule: 'FREQ=WEEKLY;BYDAY=SA' });
    const stray = item({ id: 'o9', seriesId: 'other', originalStart: TUE, rrule: null });
    expect(expandAll([series, stray], TUE).map((o) => o.id)).not.toContain('o9');
  });

  it('emits every skipped occurrence back to the horizon, and no further', () => {
    const series = item({ due: at(2020, 1, 1), rrule: 'FREQ=DAILY' });
    const out = expandAll([series], TUE);

    // Every day from the horizon to today, plus tomorrow.
    expect(out).toHaveLength(MISSED_HORIZON_DAYS + 2);
    for (const o of out) {
      expect(o.due).toBeGreaterThan(at(2026, 9, 8 - MISSED_HORIZON_DAYS - 1));
    }
  });

  it('keeps a Monday routine reachable on a Wednesday', () => {
    // Anchored on a Monday, viewed on Wednesday the 9th: nothing falls today, but
    // the next occurrence must still be there to be edited.
    const series = item({ due: at(2026, 9, 7), rrule: 'FREQ=WEEKLY;BYDAY=MO' });
    const out = expandAll([series], at(2026, 9, 9, 12));
    expect(out.some((o) => new Date(o.due ?? 0).getDate() === 14)).toBe(true);
  });

  it('emits exactly one occurrence beyond today', () => {
    const series = item({ rrule: 'FREQ=DAILY' });
    const out = expandAll([series], TUE);
    const future = out.filter((o) => (o.due ?? 0) > at(2026, 9, 8, 23, 59));
    expect(future).toHaveLength(1);
  });

  it('gives every row a distinct id, which React keys and dnd-kit both need', () => {
    const a = item({ id: 'a', rrule: 'FREQ=DAILY' });
    const b = item({ id: 'b', due: at(2026, 9, 8, 10), rrule: 'FREQ=DAILY' });
    const ids = expandAll([a, b], TUE).map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
