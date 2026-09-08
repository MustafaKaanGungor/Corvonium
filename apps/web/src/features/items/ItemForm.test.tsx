import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Item } from '@corvonium/shared';
import { ItemForm, type ItemDraft } from './ItemForm';

/** The form takes everything by props and reports through `onSubmit` — no database. */
function setup(initial?: Item) {
  const onSubmit = vi.fn<(draft: ItemDraft) => void>();
  render(<ItemForm initial={initial} projects={[]} onSubmit={onSubmit} onClose={() => {}} />);
  return { onSubmit };
}

const save = () => screen.getByRole('button', { name: initialised() ? 'Save' : 'Add' });
const initialised = () => screen.queryByRole('button', { name: 'Save' }) !== null;

const title = () => screen.getByPlaceholderText('What needs doing?');
const due = () => screen.getByLabelText(/^Due/) as HTMLInputElement;
const repeat = () => screen.getByRole('combobox', { name: '' }) as HTMLSelectElement;

/** The Repeat dropdown is the first combobox; Project is the second. */
function chooseRepeat(value: string) {
  fireEvent.change(screen.getAllByRole('combobox')[0]!, { target: { value } });
}

function type(el: HTMLElement, value: string) {
  fireEvent.change(el, { target: { value } });
}

describe('turning on a repeat', () => {
  /*
    The regression. Choosing a repeat used to leave `recurrenceError` unsatisfied,
    which disabled the button — so no recurring item could be created at all
    without first going and finding the Due field.
  */
  it('fills in a date instead of refusing to save', () => {
    setup();
    type(title(), 'Take the bins out');
    chooseRepeat('daily');

    expect(save()).toBeEnabled();
    expect(screen.queryByText(/Give it a date/)).not.toBeInTheDocument();
    expect(due().value).not.toBe('');
  });

  it('anchors it to the end of today, since a routine is not late until the day is over', () => {
    setup();
    type(title(), 'Take the bins out');
    chooseRepeat('daily');

    const today = new Date();
    const [date, time] = due().value.split('T');
    expect(time).toBe('23:59');
    expect(date).toBe(
      `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
        today.getDate(),
      ).padStart(2, '0')}`,
    );
  });

  it('leaves a date you already chose alone', () => {
    setup();
    type(title(), 'Renew the domain');
    type(due(), '2027-03-01T09:00');
    chooseRepeat('monthly');

    expect(due().value).toBe('2027-03-01T09:00');
  });

  it('submits the rule along with everything else', () => {
    const { onSubmit } = setup();
    type(title(), 'Take the bins out');
    chooseRepeat('daily');
    fireEvent.click(save());

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Take the bins out', rrule: 'FREQ=DAILY' }),
    );
  });
});

describe('the validation backstop is still there', () => {
  it('refuses a rule once the date is cleared again', () => {
    setup();
    type(title(), 'Take the bins out');
    chooseRepeat('daily');
    type(due(), '');

    expect(screen.getByText(/Give it a date or a deadline to repeat from/)).toBeInTheDocument();
    expect(save()).toBeDisabled();
  });

  it('has nothing to say about an item that does not repeat', () => {
    setup();
    type(title(), 'Renew the domain');

    expect(screen.queryByText(/Give it a date/)).not.toBeInTheDocument();
    expect(save()).toBeEnabled();
  });
});

describe('the rules that were already there', () => {
  it('will not save without a title', () => {
    setup();
    expect(save()).toBeDisabled();

    type(title(), '   ');
    expect(save()).toBeDisabled();
  });

  it('will not save a block that ends before it starts', () => {
    const { onSubmit } = setup();
    type(title(), 'Standup');
    fireEvent.click(screen.getByRole('button', { name: 'Timed' }));

    type(screen.getByLabelText(/^Starts/), '2026-09-08T10:00');
    type(screen.getByLabelText(/^Ends/), '2026-09-08T09:00');

    expect(screen.getByText(/ends before it starts/)).toBeInTheDocument();
    expect(save()).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('trims whitespace off what it submits', () => {
    const { onSubmit } = setup();
    type(title(), '  Renew the domain  ');
    fireEvent.click(save());

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ title: 'Renew the domain' }));
  });

  it('sends null rather than an empty string for no project', () => {
    const { onSubmit } = setup();
    type(title(), 'Renew the domain');
    fireEvent.click(save());

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ projectId: null }));
  });
});

describe('reopening an item', () => {
  const stored: Item = {
    id: 'i1',
    title: 'Take the bins out',
    notes: '',
    kind: 'task',
    allDay: false,
    start: null,
    end: null,
    startDate: null,
    endDate: null,
    due: new Date(2026, 8, 8, 23, 59).getTime(),
    tzid: null,
    rrule: 'FREQ=WEEKLY;BYDAY=MO,WE',
    seriesId: null,
    originalStart: null,
    status: 'open',
    completedAt: null,
    cancelledAt: null,
    projectId: null,
    location: null,
    important: true,
    sortOrder: 'a0',
    createdAt: 0,
    updatedAt: 0,
  };

  it('shows the rule it was saved with', () => {
    setup(stored);
    expect(repeat().value).toBe('weekly');
    expect(screen.getByText('Every Monday and Wednesday')).toBeInTheDocument();
  });

  it('keeps the rule when nothing about it is touched', () => {
    const { onSubmit } = setup(stored);
    fireEvent.click(save());

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ rrule: 'FREQ=WEEKLY;BYDAY=MO,WE', important: true }),
    );
  });
});
