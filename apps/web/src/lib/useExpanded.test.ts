import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { Item } from '@corvonium/shared';
import { useExpanded } from './useExpanded';

const at = (d: number, h: number, m = 0) => new Date(2026, 8, d, h, m).getTime();

const series = {
  id: 'bins',
  title: 'Take the bins out',
  notes: '',
  kind: 'task',
  allDay: false,
  start: null,
  end: null,
  startDate: null,
  endDate: null,
  due: at(1, 23, 59),
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
} satisfies Item;

function setup(now: number, items: Item[] | null = [series]) {
  return renderHook((props) => useExpanded(props.items, props.now), {
    initialProps: { items, now },
  });
}

describe('useExpanded', () => {
  it('hands back the same array for every tick of the same day', () => {
    // The same array instance throughout, the way the database hook delivers it.
    const pinned = [series];
    const { result, rerender } = setup(at(8, 0, 1), pinned);
    const morning = result.current;

    rerender({ items: pinned, now: at(8, 13) });
    rerender({ items: pinned, now: at(8, 23, 59) });

    expect(morning).not.toBeNull();
    expect(result.current).toBe(morning);
  });

  it('recomputes when the day turns', () => {
    const pinned = [series];
    const { result, rerender } = setup(at(8, 23, 59), pinned);
    const tuesday = result.current;

    rerender({ items: pinned, now: at(9, 0, 1) });

    expect(result.current).not.toBe(tuesday);
    expect(result.current?.length).toBe((tuesday?.length ?? 0) + 1);
  });

  it('recomputes when the items change', () => {
    const { result, rerender } = setup(at(8, 9));
    const before = result.current;

    rerender({ items: [series], now: at(8, 9) });
    expect(result.current).not.toBe(before);
  });

  it('stays null until the first result arrives', () => {
    expect(setup(at(8, 9), null).result.current).toBeNull();
  });
});
