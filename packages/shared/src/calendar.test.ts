import { describe, expect, it } from 'vitest';
import {
  itemSpan,
  itemsOn,
  layoutWeek,
  monthGrid,
  monthOf,
  overflow,
  shiftMonth,
  weekDays,
  type Brick,
} from './calendar';
import type { Item } from './types';

const at = (y: number, m: number, d: number, h = 9) => new Date(y, m - 1, d, h, 0).getTime();

/** 2026-09-07 is a Monday, so this is a real week row. */
const WEEK = '2026-09-07';

function item(over: Partial<Item> = {}): Item {
  return {
    id: 'i1',
    title: 'Thing',
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

/** An all-day item over a day range, which is the easiest brick to reason about. */
const bar = (id: string, from: string, to: string, over: Partial<Item> = {}) =>
  item({ id, allDay: true, startDate: from, endDate: to, ...over });

const laneOf = (bricks: Brick[], id: string) => bricks.find((b) => b.item.id === id)?.lane;
const brickOf = (bricks: Brick[], id: string) => bricks.find((b) => b.item.id === id);

/* -------------------------------------------------------------------------- */
/* the grid                                                                    */
/* -------------------------------------------------------------------------- */

describe('monthGrid', () => {
  it('is always 42 cells, so the layout never reflows between months', () => {
    for (const month of ['2026-02', '2026-09', '2026-11', '2028-02']) {
      expect(monthGrid(month)).toHaveLength(42);
    }
  });

  it('starts on a Monday', () => {
    for (const month of ['2026-01', '2026-02', '2026-09']) {
      const first = monthGrid(month)[0] ?? '';
      expect(new Date(`${first}T12:00`).getDay()).toBe(1);
    }
  });

  it('fills the leading gap from the previous month', () => {
    // 2026-09-01 is a Tuesday, so the grid opens on 31 August.
    expect(monthGrid('2026-09')[0]).toBe('2026-08-31');
  });

  it('handles a month that begins on a Sunday without dropping a week', () => {
    // 2026-11-01 is a Sunday: the grid must open on 26 October, not 2 November.
    const grid = monthGrid('2026-11');
    expect(grid[0]).toBe('2026-10-26');
    expect(grid).toContain('2026-11-30');
  });

  it('covers every day of the month it is for', () => {
    const grid = monthGrid('2026-02');
    expect(grid).toContain('2026-02-01');
    expect(grid).toContain('2026-02-28');
  });

  it('runs continuously, with no repeated or skipped day', () => {
    const grid = monthGrid('2026-09');
    expect(new Set(grid).size).toBe(42);

    for (let i = 1; i < grid.length; i++) {
      const gap = Date.parse(`${grid[i]}T12:00`) - Date.parse(`${grid[i - 1]}T12:00`);
      expect(Math.round(gap / 86_400_000)).toBe(1);
    }
  });
});

describe('weekDays and month helpers', () => {
  it('gives seven consecutive days', () => {
    expect(weekDays(WEEK)).toEqual([
      '2026-09-07',
      '2026-09-08',
      '2026-09-09',
      '2026-09-10',
      '2026-09-11',
      '2026-09-12',
      '2026-09-13',
    ]);
  });

  it('reads the month off a key', () => {
    expect(monthOf('2026-09-08')).toBe('2026-09');
  });

  it('steps months across a year boundary', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-09', 4)).toBe('2027-01');
  });
});

/* -------------------------------------------------------------------------- */
/* spans                                                                       */
/* -------------------------------------------------------------------------- */

describe('itemSpan', () => {
  it('covers an all-day range', () => {
    expect(itemSpan(bar('a', '2026-09-08', '2026-09-10'))).toEqual({
      from: '2026-09-08',
      to: '2026-09-10',
    });
  });

  it('treats a single all-day date as one day', () => {
    expect(itemSpan(item({ allDay: true, startDate: '2026-09-08' }))).toEqual({
      from: '2026-09-08',
      to: '2026-09-08',
    });
  });

  it('covers the days a timed block touches, even across midnight', () => {
    expect(itemSpan(item({ start: at(2026, 9, 8, 23), end: at(2026, 9, 9, 1) }))).toEqual({
      from: '2026-09-08',
      to: '2026-09-09',
    });
  });

  it('makes a bare deadline a single-day marker', () => {
    // A deadline is an instant, not a stretch of time, so it is never a bar.
    expect(itemSpan(item({ due: at(2026, 9, 8, 17) }))).toEqual({
      from: '2026-09-08',
      to: '2026-09-08',
    });
  });

  it('prefers the block over the deadline when an item has both', () => {
    const both = item({ start: at(2026, 9, 8), end: at(2026, 9, 8, 10), due: at(2026, 9, 20) });
    expect(itemSpan(both)?.from).toBe('2026-09-08');
  });

  it('is null for an unscheduled item, which is never drawn — §2.5', () => {
    expect(itemSpan(item())).toBeNull();
  });

  it('is null for an all-day item with no date at all', () => {
    expect(itemSpan(item({ allDay: true }))).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* week segmentation                                                           */
/* -------------------------------------------------------------------------- */

describe('spanning a week boundary', () => {
  // Thursday 10 September → Tuesday 15 September, across the Sunday cut.
  const crossing = bar('x', '2026-09-10', '2026-09-15');

  it('draws Thursday to Sunday in the first row', () => {
    const brick = brickOf(layoutWeek([crossing], '2026-09-07'), 'x');
    expect(brick).toMatchObject({ colStart: 4, colEnd: 8, continuesLeft: false });
  });

  it('draws Monday to Tuesday in the next row', () => {
    const brick = brickOf(layoutWeek([crossing], '2026-09-14'), 'x');
    expect(brick).toMatchObject({ colStart: 1, colEnd: 3, continuesRight: false });
  });

  it('marks only the cut edges, so the arrows point the right way', () => {
    expect(brickOf(layoutWeek([crossing], '2026-09-07'), 'x')?.continuesRight).toBe(true);
    expect(brickOf(layoutWeek([crossing], '2026-09-14'), 'x')?.continuesLeft).toBe(true);
  });

  it('leaves a brick that fits inside one row square on neither edge', () => {
    const brick = brickOf(layoutWeek([bar('y', '2026-09-08', '2026-09-09')], WEEK), 'y');
    expect(brick).toMatchObject({ continuesLeft: false, continuesRight: false });
  });

  it('spans a whole row for an item covering the week and more', () => {
    const brick = brickOf(layoutWeek([bar('z', '2026-09-01', '2026-09-30')], WEEK), 'z');
    expect(brick).toMatchObject({
      colStart: 1,
      colEnd: 8,
      continuesLeft: true,
      continuesRight: true,
    });
  });

  it('ignores an item that misses the row entirely', () => {
    expect(layoutWeek([bar('far', '2026-10-01', '2026-10-02')], WEEK)).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* lanes                                                                       */
/* -------------------------------------------------------------------------- */

describe('lane assignment', () => {
  it('keeps a spanning brick in one lane across its whole span', () => {
    // The reason lanes exist: a bar must not sit at one height on Monday and
    // another on Tuesday.
    const bricks = layoutWeek(
      [bar('long', '2026-09-07', '2026-09-11'), bar('short', '2026-09-09', '2026-09-09')],
      WEEK,
    );

    expect(laneOf(bricks, 'long')).toBe(1);
    expect(laneOf(bricks, 'short')).toBe(2);
  });

  it('does not let a later short brick push a long one down', () => {
    const bricks = layoutWeek(
      [bar('short', '2026-09-07', '2026-09-07'), bar('long', '2026-09-07', '2026-09-11')],
      WEEK,
    );

    // Same start day, so the longer span is laid first and keeps lane 1.
    expect(laneOf(bricks, 'long')).toBe(1);
    expect(laneOf(bricks, 'short')).toBe(2);
  });

  it('reuses a lane once the brick occupying it has finished', () => {
    const bricks = layoutWeek(
      [bar('a', '2026-09-07', '2026-09-08'), bar('b', '2026-09-10', '2026-09-11')],
      WEEK,
    );

    expect(laneOf(bricks, 'a')).toBe(1);
    expect(laneOf(bricks, 'b')).toBe(1);
  });

  it('stacks items sharing a day', () => {
    const bricks = layoutWeek(
      ['a', 'b', 'c'].map((id) => bar(id, '2026-09-08', '2026-09-08')),
      WEEK,
    );
    expect(bricks.map((b) => b.lane).toSorted()).toEqual([1, 2, 3]);
  });

  it('is deterministic however the items arrive', () => {
    const items = [
      bar('a', '2026-09-07', '2026-09-09'),
      bar('b', '2026-09-08', '2026-09-08'),
      bar('c', '2026-09-09', '2026-09-11'),
    ];
    const forwards = layoutWeek(items, WEEK).map((b) => `${b.item.id}:${b.lane}`);
    const backwards = layoutWeek(items.toReversed(), WEEK).map((b) => `${b.item.id}:${b.lane}`);

    expect(forwards).toEqual(backwards);
  });
});

describe('routines yield their lane', () => {
  const routine = bar('routine', '2026-09-08', '2026-09-08', { rrule: 'FREQ=DAILY' });
  const oneOff = bar('oneoff', '2026-09-08', '2026-09-08');

  it('puts a one-off above a routine on the same day', () => {
    expect(laneOf(layoutWeek([routine, oneOff], WEEK), 'oneoff')).toBe(1);
    expect(laneOf(layoutWeek([routine, oneOff], WEEK), 'routine')).toBe(2);
  });

  it('does so whichever order they arrive in', () => {
    expect(laneOf(layoutWeek([oneOff, routine], WEEK), 'routine')).toBe(2);
  });

  it('yields even to a one-off that starts later in the week', () => {
    // A routine on Monday still gives up lane 1 on Wednesday to a one-off there.
    const bricks = layoutWeek(
      [bar('r', '2026-09-07', '2026-09-11', { rrule: 'FREQ=DAILY' }), oneOff],
      WEEK,
    );
    expect(laneOf(bricks, 'oneoff')).toBe(1);
    expect(laneOf(bricks, 'r')).toBe(2);
  });

  it('still takes lane 1 when nothing is competing with it', () => {
    expect(laneOf(layoutWeek([routine], WEEK), 'routine')).toBe(1);
  });
});

/* -------------------------------------------------------------------------- */
/* overflow                                                                    */
/* -------------------------------------------------------------------------- */

describe('overflow', () => {
  const five = ['a', 'b', 'c', 'd', 'e'].map((id) => bar(id, '2026-09-08', '2026-09-08'));

  it('counts what a day cannot show', () => {
    const bricks = layoutWeek(five, WEEK);
    expect(overflow(bricks, WEEK, 3).get('2026-09-08')).toBe(2);
  });

  it('counts nothing when everything fits', () => {
    expect(overflow(layoutWeek(five, WEEK), WEEK, 5).size).toBe(0);
  });

  it('hides a spanning brick on every day it covers, never half of it', () => {
    const items = [
      ...['a', 'b', 'c'].map((id) => bar(id, '2026-09-07', '2026-09-11')),
      bar('wide', '2026-09-07', '2026-09-11'),
    ];
    const bricks = layoutWeek(items, WEEK);
    const hidden = overflow(bricks, WEEK, 3);

    // The fourth bar is over the cap, so it is absent from all five of its days.
    for (const day of weekDays(WEEK).slice(0, 5)) expect(hidden.get(day)).toBe(1);
    expect(hidden.get('2026-09-13')).toBeUndefined();
  });

  it('leaves untouched days out of the map entirely', () => {
    expect(overflow(layoutWeek(five, WEEK), WEEK, 3).has('2026-09-09')).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* the day panel                                                               */
/* -------------------------------------------------------------------------- */

describe('itemsOn', () => {
  const day = '2026-09-08';
  const timed = item({ id: 'timed', start: at(2026, 9, 8, 14), end: at(2026, 9, 8, 15) });
  const early = item({ id: 'early', start: at(2026, 9, 8, 9), end: at(2026, 9, 8, 10) });
  const allDay = bar('allday', '2026-09-08', '2026-09-08');
  const deadline = item({ id: 'due', due: at(2026, 9, 8, 17) });

  it('picks up everything touching the day, including a bar passing through', () => {
    const passing = bar('passing', '2026-09-06', '2026-09-10');
    expect(itemsOn([passing], day).map((i) => i.id)).toEqual(['passing']);
  });

  it('leaves out days the item does not touch', () => {
    expect(itemsOn([timed], '2026-09-09')).toEqual([]);
  });

  it('lists timed items in clock order, before all-day ones', () => {
    const order = itemsOn([allDay, timed, early], day).map((i) => i.id);
    expect(order).toEqual(['early', 'timed', 'allday']);
  });

  it('puts a bare deadline in among the timed items by its hour', () => {
    expect(itemsOn([deadline, early], day).map((i) => i.id)).toEqual(['early', 'due']);
  });

  it('never lists an unscheduled item', () => {
    expect(itemsOn([item({ id: 'floating' })], day)).toEqual([]);
  });
});
