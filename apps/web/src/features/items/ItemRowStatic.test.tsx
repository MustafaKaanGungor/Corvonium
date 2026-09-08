import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Item, Project } from '@corvonium/shared';
import { ItemRowStatic } from './ItemRowStatic';
import { toggleDone } from '../../db/items';

/*
  The one component here that reaches the database. Mocking the module keeps RxDB
  out of a unit test and turns the assertion into the useful one: *what* the row
  hands to the write layer.
*/
vi.mock('../../db/items', () => ({ toggleDone: vi.fn() }));

const NOW = new Date(2026, 8, 8, 12, 0).getTime();
const at = (y: number, m: number, d: number, h = 9) => new Date(y, m - 1, d, h, 0).getTime();

function item(over: Partial<Item> = {}): Item {
  return {
    id: 'i1',
    title: 'Renew the domain',
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

function row(over: Partial<Item> = {}, project?: Project) {
  const value = item(over);
  render(<ItemRowStatic item={value} now={NOW} project={project} onOpen={() => {}} />);
  return value;
}

beforeEach(() => vi.mocked(toggleDone).mockClear());

describe('the checkbox', () => {
  it('hands the item to the write layer', () => {
    const value = row({ due: at(2026, 9, 8) });
    fireEvent.click(screen.getByRole('button', { name: 'Mark as done' }));

    expect(toggleDone).toHaveBeenCalledWith(value);
  });

  it('hands over the occurrence, not the series, so the override path is reached', () => {
    // Block 5: an occurrence has no document of its own, and `toggleDone` routes on
    // `seriesId`. Passing the series here would tick the wrong thing.
    const value = row({
      id: 'i1:123',
      seriesId: 'i1',
      originalStart: at(2026, 9, 8),
      due: at(2026, 9, 8),
      rrule: 'FREQ=DAILY',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Mark as done' }));

    expect(toggleDone).toHaveBeenCalledWith(value);
    expect(vi.mocked(toggleDone).mock.calls[0]?.[0]).toMatchObject({
      seriesId: 'i1',
      originalStart: at(2026, 9, 8),
    });
  });

  it('offers to undo once done', () => {
    row({ status: 'done', completedAt: NOW });
    expect(screen.getByRole('button', { name: 'Mark as not done' })).toBeInTheDocument();
  });
});

describe('the sub-line', () => {
  it('says how late in words, not as a date', () => {
    // `formatRelativeDay` was written to the plan and then not wired in for a
    // while; this is what stops that happening twice.
    row({ due: at(2026, 9, 7) });
    expect(screen.getByText('Missed · yesterday')).toBeInTheDocument();
  });

  it('counts whole days, so late last night is still yesterday', () => {
    row({ due: at(2026, 9, 7, 23) });
    expect(screen.getByText('Missed · yesterday')).toBeInTheDocument();
  });

  it('shows an event by its start, never its end labelled as a deadline', () => {
    // The bug fixed in block 3: `effectiveDue` falls back to `end`, so an event
    // used to advertise its finish time as "Due". Scheduled ahead of `now`, since
    // an event already past is missed and missed wins — see below.
    row({ kind: 'event', start: at(2026, 9, 8, 14), end: at(2026, 9, 8, 15) });

    expect(screen.getByText(/14:00–15:00/)).toBeInTheDocument();
    expect(screen.queryByText(/^Due/)).not.toBeInTheDocument();
  });

  it('calls an event that has already finished missed, since it was never ticked', () => {
    // Missed takes precedence over the time block — §2.2 treats an unattended
    // event exactly like an unfinished task.
    row({ kind: 'event', start: at(2026, 9, 8, 9), end: at(2026, 9, 8, 10) });
    expect(screen.getByText('Missed · today')).toBeInTheDocument();
  });

  it('shows a deadline as a deadline', () => {
    row({ due: at(2026, 9, 20, 17) });
    expect(screen.getByText(/^Due 20\/09\/2026/)).toBeInTheDocument();
  });

  it('says nothing at all for an unscheduled item', () => {
    row();
    expect(screen.getByText('Renew the domain')).toBeInTheDocument();
    expect(screen.queryByText(/Due|Missed/)).not.toBeInTheDocument();
  });

  it('reads as cancelled rather than as a deadline', () => {
    row({ status: 'cancelled', cancelledAt: NOW, due: at(2026, 9, 1) });
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
  });

  it('does not call a done item missed, however far past its deadline', () => {
    row({ status: 'done', completedAt: NOW, due: at(2026, 1, 1) });
    expect(screen.queryByText(/Missed/)).not.toBeInTheDocument();
  });
});

describe('the project dot', () => {
  it('is titled with the project name, since colour alone says nothing', () => {
    row({ projectId: 'p1' }, { id: 'p1', name: 'Corvonium' } as Project);
    expect(screen.getByTitle('Corvonium')).toBeInTheDocument();
  });

  it('is absent when the item has no project', () => {
    row();
    expect(screen.queryByTitle(/./)).not.toBeInTheDocument();
  });
});
