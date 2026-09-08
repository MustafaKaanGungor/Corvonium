import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Item, Project, SessionTotals } from '@corvonium/shared';
import { WeekRow } from './WeekRow';

vi.mock('../../db/items', () => ({ toggleDone: vi.fn() }));

/** 2026-09-07 is a Monday. */
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

const bar = (id: string, from: string, to: string, over: Partial<Item> = {}) =>
  item({ id, title: id, allDay: true, startDate: from, endDate: to, ...over });

function row(items: Item[], over: Partial<Parameters<typeof WeekRow>[0]> = {}) {
  render(
    <WeekRow
      weekStart={WEEK}
      month="2026-09"
      today="2026-09-08"
      selected="2026-09-08"
      items={items}
      projects={[]}
      mode="plan"
      effort={new Map<string, SessionTotals>()}
      now={new Date(2026, 8, 8, 12).getTime()}
      maxLanes={3}
      onSelect={() => {}}
      onOpenDay={() => {}}
      {...over}
    />,
  );
}

const brick = (title: string) => screen.getByTitle(title);

/*
  `calendar.test.ts` proves the layout arithmetic. This file covers the glue: that
  those numbers actually reach `grid-column` and `grid-row`, which is where a
  correct algorithm can still be drawn wrongly.
*/

describe('bricks reach the grid', () => {
  it('puts a span into grid-column and its lane into grid-row', () => {
    row([bar('Sprint', '2026-09-08', '2026-09-10')]);
    expect(brick('Sprint').style.gridColumn).toBe('2 / 5');
    expect(brick('Sprint').style.gridRow).toBe('1');
  });

  it('stacks a second item into the next row', () => {
    row([bar('a', '2026-09-08', '2026-09-08'), bar('b', '2026-09-08', '2026-09-08')]);
    expect(new Set([brick('a').style.gridRow, brick('b').style.gridRow])).toEqual(
      new Set(['1', '2']),
    );
  });

  it('squares off and un-insets the edge where a bar was cut', () => {
    row([bar('Conference', '2026-09-10', '2026-09-15')]);
    const el = brick('Conference');

    expect(el.style.marginRight).toBe('0px'); // continues into the next week
    expect(el.style.marginLeft).toBe('2px'); // but begins in this one
    expect(el.style.borderTopRightRadius).toBe('0px');
  });
});

describe('the four brick signals stay on four channels', () => {
  it('fills with the project colour', () => {
    const project = { id: 'p1', name: 'Corvonium', color: 'rgb(76, 194, 106)' } as Project;
    row([bar('Sprint', '2026-09-08', '2026-09-08', { projectId: 'p1' })], { projects: [project] });
    expect(brick('Sprint').style.background).toBe('rgb(76, 194, 106)');
  });

  it('draws a bare deadline as an outline rather than a fill', () => {
    // Shape carries "this is a deadline", so colour stays free for the project.
    row([item({ id: 'd', title: 'Rent', due: new Date(2026, 8, 9, 17).getTime() })]);
    expect(brick('Rent').style.background).toBe('transparent');
    expect(brick('Rent').style.boxShadow).toContain('inset');
  });

  it('dims and strikes through something already done', () => {
    row([bar('Sprint', '2026-09-08', '2026-09-08', { status: 'done' })]);
    expect(brick('Sprint').className).toContain('line-through');
    expect(brick('Sprint').className).toContain('opacity-35');
  });

  it('rings a missed item without touching its colour', () => {
    row([item({ id: 'm', title: 'Rent', due: new Date(2026, 8, 7, 9).getTime() })]);
    expect(brick('Rent').className).toContain('ring-[#D9614F]');
  });
});

describe('overflow', () => {
  const five = ['a', 'b', 'c', 'd', 'e'].map((id) => bar(id, '2026-09-08', '2026-09-08'));

  it('shows one fewer brick and a count once a row spills', () => {
    // The cap drops from 3 to 2 to make room for the footer, so five items leave
    // two drawn and three counted.
    row(five);
    expect(screen.getByText('+3 more')).toBeInTheDocument();
    expect(screen.queryByTitle('c')).not.toBeInTheDocument();
  });

  it('keeps all three when exactly three fit', () => {
    row(five.slice(0, 3));
    expect(screen.queryByText(/more/)).not.toBeInTheDocument();
    expect(screen.getByTitle('c')).toBeInTheDocument();
  });

  it('hides a spanning bar from every day rather than half of it', () => {
    row([
      ...['a', 'b', 'c'].map((id) => bar(id, '2026-09-07', '2026-09-11')),
      bar('wide', '2026-09-07', '2026-09-11'),
    ]);
    expect(screen.queryByTitle('wide')).not.toBeInTheDocument();
  });
});

describe('modes are exclusive', () => {
  it('draws no bricks at all in Effort mode', () => {
    // §3.2: Effort takes the cell over completely rather than squeezing in beside.
    row([bar('Sprint', '2026-09-08', '2026-09-08')], { mode: 'effort' });
    expect(screen.queryByTitle('Sprint')).not.toBeInTheDocument();
  });
});

describe('the cells themselves', () => {
  it('always draws seven, however empty the week', () => {
    row([]);
    expect(screen.getAllByRole('button')).toHaveLength(7);
  });

  it('dims days belonging to the neighbouring month', () => {
    row([], { weekStart: '2026-08-31' });
    // 31 August sits in September's grid and must read as outside it.
    const august = screen.getByRole('button', { name: '31' });
    expect(august.className).toContain('bg-transparent');
  });
});
