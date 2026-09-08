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
  LONG_BREAK_MS,
  WORK_IDLE_MS,
} from './sessions';
import type { Segment, Session } from './types';

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
