import { describe, expect, it } from 'vitest';
import {
  endSession,
  isSuspect,
  itemTotals,
  liveSegment,
  localDayKey,
  segmentDuration,
  sessionTotals,
  setItems,
  startSession,
  switchTo,
  trimError,
  aggregateTotals,
  dayKeysIn,
  dayTotals,
  monthRange,
  onlyProject,
  projectTotals,
  sessionsIn,
  weekRange,
  LONG_BREAK_MS,
  WORK_IDLE_MS,
} from './sessions';
import type { Item, Segment, Session } from './types';

const MIN = 60_000;

/** 2026-09-08 09:00 local — the suite pins TZ to Europe/Istanbul. */
const T0 = new Date(2026, 8, 8, 9, 0, 0).getTime();

function session(segments: Segment[], over: Partial<Session> = {}): Session {
  return {
    id: 's1',
    startedAt: segments[0]?.startedAt ?? T0,
    endedAt: null,
    segments,
    lastSeenAt: T0,
    createdAt: T0,
    updatedAt: T0,
    ...over,
  };
}

const seg = (
  kind: 'work' | 'break',
  from: number,
  to: number | null,
  itemIds: string[] = [],
): Segment => ({ kind, itemIds, startedAt: from, endedAt: to });

describe('segmentDuration', () => {
  it('measures a closed segment from its own ends', () => {
    expect(segmentDuration(seg('work', T0, T0 + 30 * MIN), T0 + 99 * MIN)).toBe(30 * MIN);
  });

  it('measures the live segment against the wall clock', () => {
    expect(segmentDuration(seg('work', T0, null), T0 + 12 * MIN)).toBe(12 * MIN);
  });

  it('never goes negative if the clock moves backwards', () => {
    expect(segmentDuration(seg('work', T0, null), T0 - 5 * MIN)).toBe(0);
  });
});

describe('sessionTotals', () => {
  const s = session([
    seg('work', T0, T0 + 40 * MIN),
    seg('break', T0 + 40 * MIN, T0 + 50 * MIN),
    seg('work', T0 + 50 * MIN, null),
  ]);

  it('sums work and break, and the parts add up to the total', () => {
    const t = sessionTotals(s, T0 + 60 * MIN);
    expect(t.work).toBe(50 * MIN);
    expect(t.break).toBe(10 * MIN);
    expect(t.total).toBe(t.work + t.break);
    expect(t.count).toBe(3);
  });

  it('gives focus as work over total', () => {
    expect(sessionTotals(s, T0 + 60 * MIN).focus).toBeCloseTo(50 / 60);
  });

  it('reports zero focus rather than NaN on a session with no elapsed time', () => {
    const empty = session([seg('work', T0, null)]);
    const t = sessionTotals(empty, T0);
    expect(t.total).toBe(0);
    expect(t.focus).toBe(0);
  });
});

describe('itemTotals', () => {
  it('counts a segment in full against every item it carries', () => {
    // Forty minutes on two items is forty against each, not twenty — §2.6.
    const s = session([seg('work', T0, T0 + 40 * MIN, ['a', 'b'])]);
    const totals = itemTotals([s], T0 + 40 * MIN);

    expect(totals.get('a')).toBe(40 * MIN);
    expect(totals.get('b')).toBe(40 * MIN);

    const summed = [...totals.values()].reduce((a, b) => a + b, 0);
    expect(summed).toBe(80 * MIN);
    expect(summed).toBeGreaterThan(sessionTotals(s, T0 + 40 * MIN).total);
  });

  it('accumulates one item across sessions', () => {
    const a = session([seg('work', T0, T0 + 20 * MIN, ['a'])]);
    const b = session([seg('work', T0 + 60 * MIN, T0 + 90 * MIN, ['a'])], { id: 's2' });
    expect(itemTotals([a, b], T0 + 90 * MIN).get('a')).toBe(50 * MIN);
  });

  it('ignores break segments', () => {
    const s = session([seg('break', T0, T0 + 30 * MIN, ['a'])]);
    expect(itemTotals([s], T0 + 30 * MIN).has('a')).toBe(false);
  });
});

describe('localDayKey', () => {
  it('reads the local calendar date', () => {
    expect(localDayKey(new Date(2026, 8, 8, 9, 0).getTime())).toBe('2026-09-08');
  });

  it('rolls over at local midnight, not UTC midnight', () => {
    expect(localDayKey(new Date(2026, 8, 8, 23, 59).getTime())).toBe('2026-09-08');
    expect(localDayKey(new Date(2026, 8, 9, 0, 1).getTime())).toBe('2026-09-09');
  });

  it('pads single-digit months and days', () => {
    expect(localDayKey(new Date(2026, 0, 5, 12, 0).getTime())).toBe('2026-01-05');
  });
});

describe('startSession', () => {
  it('opens the session and a live work segment together', () => {
    const s = startSession(T0, 'abc');
    expect(s.endedAt).toBeNull();
    expect(s.segments).toHaveLength(1);
    expect(liveSegment(s)).toMatchObject({ kind: 'work', itemIds: [], startedAt: T0 });
  });
});

describe('switchTo', () => {
  const working = session([seg('work', T0, null, ['a'])]);

  it('closes the live segment and opens the new one at the same instant', () => {
    const s = switchTo(working, 'break', T0 + 25 * MIN);
    expect(s.segments[0]?.endedAt).toBe(T0 + 25 * MIN);
    expect(s.segments[1]?.startedAt).toBe(T0 + 25 * MIN);
    // No gap: the parts still sum to the whole.
    expect(sessionTotals(s, T0 + 30 * MIN).total).toBe(30 * MIN);
  });

  it('does not carry items into a break', () => {
    expect(liveSegment(switchTo(working, 'break', T0 + 25 * MIN))?.itemIds).toEqual([]);
  });

  it('starts you on nothing when coming back from a break', () => {
    const onBreak = switchTo(working, 'break', T0 + 25 * MIN);
    expect(liveSegment(switchTo(onBreak, 'work', T0 + 35 * MIN))?.itemIds).toEqual([]);
  });

  it('carries items forward on work to work', () => {
    expect(liveSegment(switchTo(working, 'work', T0 + 25 * MIN))?.itemIds).toEqual(['a']);
  });
});

describe('setItems', () => {
  it('opens a new segment rather than editing the current one', () => {
    const s = setItems(session([seg('work', T0, null, ['a'])]), ['b'], T0 + 15 * MIN);

    expect(s.segments).toHaveLength(2);
    // The first fifteen minutes stay attributed to 'a', which is the point.
    expect(s.segments[0]).toMatchObject({ itemIds: ['a'], endedAt: T0 + 15 * MIN });
    expect(liveSegment(s)).toMatchObject({ itemIds: ['b'], kind: 'work' });
  });

  it('keeps the segment kind', () => {
    const s = setItems(session([seg('break', T0, null)]), ['b'], T0 + 5 * MIN);
    expect(liveSegment(s)?.kind).toBe('break');
  });

  it('does nothing to a session that has already ended', () => {
    const done = session([seg('work', T0, T0 + MIN)], { endedAt: T0 + MIN });
    expect(setItems(done, ['b'], T0 + 5 * MIN)).toBe(done);
  });
});

describe('endSession', () => {
  it('closes the live segment and the session on the same instant', () => {
    const s = endSession(session([seg('work', T0, null)]), T0 + 40 * MIN);
    expect(s.endedAt).toBe(T0 + 40 * MIN);
    expect(liveSegment(s)).toBeNull();
    expect(sessionTotals(s, T0 + 999 * MIN).total).toBe(40 * MIN);
  });

  it('trims a segment that overruns the end instant', () => {
    const s = endSession(session([seg('work', T0, T0 + 90 * MIN)]), T0 + 30 * MIN);
    expect(s.segments[0]?.endedAt).toBe(T0 + 30 * MIN);
  });

  it('drops segments that started after the end instant', () => {
    const forgotten = session([seg('work', T0, T0 + 30 * MIN), seg('break', T0 + 30 * MIN, null)]);
    const s = endSession(forgotten, T0 + 10 * MIN);
    expect(s.segments).toHaveLength(1);
    expect(s.segments[0]?.endedAt).toBe(T0 + 10 * MIN);
  });

  it('leaves totals stable however long after the fact they are read', () => {
    const s = endSession(session([seg('work', T0, null)]), T0 + 40 * MIN);
    expect(sessionTotals(s, T0 + 40 * MIN)).toEqual(sessionTotals(s, T0 + 5000 * MIN));
  });
});

describe('isSuspect', () => {
  const working = session([seg('work', T0, null)], { lastSeenAt: T0 });
  const onBreak = session([seg('break', T0, null)], { lastSeenAt: T0 });

  it('flags work that has not seen you in a while', () => {
    expect(isSuspect(working, T0 + WORK_IDLE_MS + MIN)).toBe('work-idle');
  });

  it('leaves work alone while the heartbeat is fresh', () => {
    expect(isSuspect(working, T0 + WORK_IDLE_MS - MIN)).toBeNull();
  });

  it('does not judge a break by the heartbeat — absence is what a break is', () => {
    // Long past the work threshold, but the break itself is still plausible.
    expect(isSuspect(onBreak, T0 + WORK_IDLE_MS + MIN)).toBeNull();
  });

  it('flags a break only once its own length is implausible', () => {
    expect(isSuspect(onBreak, T0 + LONG_BREAK_MS - MIN)).toBeNull();
    expect(isSuspect(onBreak, T0 + LONG_BREAK_MS + MIN)).toBe('long-break');
  });

  it('never flags a session that has ended', () => {
    const done = session([seg('work', T0, T0 + MIN)], { endedAt: T0 + MIN, lastSeenAt: T0 });
    expect(isSuspect(done, T0 + 5000 * MIN)).toBeNull();
  });
});

describe('trimError', () => {
  const s = session([seg('work', T0, T0 + 20 * MIN), seg('break', T0 + 20 * MIN, null)]);
  const now = T0 + 60 * MIN;

  it('accepts an instant inside the live segment', () => {
    expect(trimError(s, T0 + 40 * MIN, now)).toBeNull();
  });

  it('accepts both edges', () => {
    expect(trimError(s, T0 + 20 * MIN, now)).toBeNull();
    expect(trimError(s, now, now)).toBeNull();
  });

  it('rejects an instant before the live segment started', () => {
    expect(trimError(s, T0 + 19 * MIN, now)).not.toBeNull();
  });

  it('rejects the future', () => {
    expect(trimError(s, now + MIN, now)).not.toBeNull();
  });

  it('rejects an unparseable time', () => {
    expect(trimError(s, Number.NaN, now)).not.toBeNull();
  });

  it('rejects a session that has already ended', () => {
    const done = session([seg('work', T0, T0 + MIN)], { endedAt: T0 + MIN });
    expect(trimError(done, T0 + MIN, now)).not.toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* ranges and aggregation                                                      */
/* -------------------------------------------------------------------------- */

const item = (id: string, projectId: string | null): Item => ({ id, projectId }) as unknown as Item;

/** A session on a given local day: one work segment of `mins`, then an optional break. */
const onDay = (
  y: number,
  m: number,
  d: number,
  mins: number,
  itemIds: string[] = [],
  breakMins = 0,
): Session => {
  const start = new Date(y, m - 1, d, 9, 0).getTime();
  const workEnd = start + mins * MIN;
  return session(
    breakMins === 0
      ? [seg('work', start, workEnd, itemIds)]
      : [seg('work', start, workEnd, itemIds), seg('break', workEnd, workEnd + breakMins * MIN)],
    { id: `${y}-${m}-${d}-${mins}`, startedAt: start, endedAt: workEnd + breakMins * MIN },
  );
};

describe('weekRange', () => {
  it('runs Monday to Sunday around a midweek day', () => {
    // 2026-09-08 is a Tuesday.
    expect(weekRange(new Date(2026, 8, 8, 12, 0).getTime())).toEqual({
      from: '2026-09-07',
      to: '2026-09-13',
    });
  });

  it('treats Sunday as the end of its week, not the start', () => {
    expect(weekRange(new Date(2026, 8, 13, 12, 0).getTime())).toEqual({
      from: '2026-09-07',
      to: '2026-09-13',
    });
  });

  it('spans a month boundary without breaking', () => {
    // 2026-10-01 is a Thursday, so the week begins in September.
    expect(weekRange(new Date(2026, 9, 1, 12, 0).getTime()).from).toBe('2026-09-28');
  });
});

describe('monthRange', () => {
  it('covers the whole calendar month', () => {
    expect(monthRange(new Date(2026, 8, 8).getTime())).toEqual({
      from: '2026-09-01',
      to: '2026-09-30',
    });
  });

  it('gets February right in a leap year', () => {
    expect(monthRange(new Date(2028, 1, 10).getTime()).to).toBe('2028-02-29');
  });
});

describe('dayKeysIn', () => {
  it('is inclusive at both ends', () => {
    expect(dayKeysIn({ from: '2026-09-07', to: '2026-09-09' })).toEqual([
      '2026-09-07',
      '2026-09-08',
      '2026-09-09',
    ]);
  });

  it('returns a single day for a one-day range', () => {
    expect(dayKeysIn({ from: '2026-09-08', to: '2026-09-08' })).toEqual(['2026-09-08']);
  });

  it('crosses a month boundary', () => {
    expect(dayKeysIn({ from: '2026-09-29', to: '2026-10-02' })).toHaveLength(4);
  });

  it('is empty when the range is inverted', () => {
    expect(dayKeysIn({ from: '2026-09-09', to: '2026-09-07' })).toEqual([]);
  });
});

describe('sessionsIn', () => {
  const all = [onDay(2026, 9, 6, 30), onDay(2026, 9, 8, 30), onDay(2026, 9, 20, 30)];

  it('keeps only sessions started inside the range', () => {
    expect(sessionsIn(all, { from: '2026-09-07', to: '2026-09-13' })).toHaveLength(1);
  });

  it('includes both boundary days', () => {
    expect(sessionsIn(all, { from: '2026-09-06', to: '2026-09-08' })).toHaveLength(2);
  });

  it('files a session by the day it started, not the day it ended', () => {
    // 23:30 -> 00:30 belongs wholly to the 8th.
    const startedAt = new Date(2026, 8, 8, 23, 30).getTime();
    const overnight = session([seg('work', startedAt, startedAt + 60 * MIN)], { startedAt });
    expect(sessionsIn([overnight], { from: '2026-09-09', to: '2026-09-09' })).toHaveLength(0);
    expect(sessionsIn([overnight], { from: '2026-09-08', to: '2026-09-08' })).toHaveLength(1);
  });
});

describe('aggregateTotals', () => {
  it('sums across sessions and keeps the parts adding up', () => {
    const t = aggregateTotals([onDay(2026, 9, 8, 40, [], 10), onDay(2026, 9, 9, 20)], T0);
    expect(t.work).toBe(60 * MIN);
    expect(t.break).toBe(10 * MIN);
    expect(t.total).toBe(t.work + t.break);
    expect(t.count).toBe(3);
  });

  it('is zero, not NaN, over no sessions at all', () => {
    expect(aggregateTotals([], T0)).toEqual({ work: 0, break: 0, total: 0, focus: 0, count: 0 });
  });
});

describe('dayTotals', () => {
  it('buckets sessions by their start day and sums each', () => {
    const totals = dayTotals(
      [onDay(2026, 9, 8, 30), onDay(2026, 9, 8, 20), onDay(2026, 9, 9, 15)],
      T0,
    );
    expect(totals.get('2026-09-08')?.work).toBe(50 * MIN);
    expect(totals.get('2026-09-09')?.work).toBe(15 * MIN);
  });

  it('omits days with no sessions rather than storing zeroes', () => {
    expect(dayTotals([onDay(2026, 9, 8, 30)], T0).has('2026-09-09')).toBe(false);
  });
});

describe('projectTotals', () => {
  const items = [item('a', 'p1'), item('b', 'p1'), item('c', 'p2'), item('d', null)];

  it('sums a project across its items', () => {
    const s = [onDay(2026, 9, 8, 30, ['a']), onDay(2026, 9, 9, 20, ['b'])];
    expect(projectTotals(s, items, T0).get('p1')).toBe(50 * MIN);
  });

  it('counts a segment against both projects it touches', () => {
    const totals = projectTotals([onDay(2026, 9, 8, 40, ['a', 'c'])], items, T0);
    expect(totals.get('p1')).toBe(40 * MIN);
    expect(totals.get('p2')).toBe(40 * MIN);
  });

  it('counts a segment once for a project even when it carries two of its items', () => {
    // 'a' and 'b' are both in p1. Forty minutes on both is forty on p1, not eighty:
    // within one project there is no ambiguity about where the time went, and
    // double-counting would let a project exceed the work total it belongs to.
    const s = [onDay(2026, 9, 8, 40, ['a', 'b'])];
    expect(projectTotals(s, items, T0).get('p1')).toBe(40 * MIN);
    expect(projectTotals(s, items, T0).get('p1')).toBeLessThanOrEqual(aggregateTotals(s, T0).work);
  });

  it('never lets any single project exceed the work total', () => {
    const s = [onDay(2026, 9, 8, 40, ['a', 'b']), onDay(2026, 9, 9, 30, ['a'])];
    const work = aggregateTotals(s, T0).work;
    for (const ms of projectTotals(s, items, T0).values()) expect(ms).toBeLessThanOrEqual(work);
  });

  it('files unprojected items under null rather than dropping them', () => {
    expect(projectTotals([onDay(2026, 9, 8, 25, ['d'])], items, T0).get(null)).toBe(25 * MIN);
  });

  it('ignores an item that no longer exists instead of guessing', () => {
    expect(projectTotals([onDay(2026, 9, 8, 25, ['gone'])], items, T0).size).toBe(0);
  });
});

describe('onlyProject', () => {
  const items = [item('a', 'p1'), item('c', 'p2')];

  it('keeps only work segments touching the project', () => {
    const s = [onDay(2026, 9, 8, 40, ['a'], 10), onDay(2026, 9, 9, 20, ['c'])];
    const t = aggregateTotals(onlyProject(s, items, 'p1'), T0);

    expect(t.work).toBe(40 * MIN);
    // Break time belongs to no project, so it is gone — which is why the screen
    // shows a dash for break and focus under a project filter.
    expect(t.break).toBe(0);
  });

  it('drops work on items outside the project', () => {
    const filtered = onlyProject([onDay(2026, 9, 8, 40, ['c'])], items, 'p1');
    expect(aggregateTotals(filtered, T0).work).toBe(0);
  });

  it('keeps a shared segment in full for each project it touches', () => {
    const s = [onDay(2026, 9, 8, 40, ['a', 'c'])];
    expect(aggregateTotals(onlyProject(s, items, 'p1'), T0).work).toBe(40 * MIN);
    expect(aggregateTotals(onlyProject(s, items, 'p2'), T0).work).toBe(40 * MIN);
  });
});
