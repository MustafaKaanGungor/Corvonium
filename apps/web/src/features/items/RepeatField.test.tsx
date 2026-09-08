import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { RepeatField } from './RepeatField';

/**
 * `RepeatField` takes `Dispatch<SetStateAction<…>>`, so it must be driven through
 * something that actually holds state — the way `ItemForm` uses it. Asserting on a
 * spy would only describe the shape of the updater, not what it produces.
 *
 * The current rule is mirrored into the DOM so a test can read it without
 * reaching into React.
 */
function Harness({ initial = null }: { initial?: string | null }) {
  const [rrule, setRrule] = useState<string | null>(initial);
  return (
    <>
      <RepeatField value={rrule} error={null} onChange={setRrule} />
      <output data-testid="rule">{rrule ?? 'null'}</output>
    </>
  );
}

const rule = () => screen.getByTestId('rule').textContent;
const preset = () => screen.getByRole('combobox') as HTMLSelectElement;

/** Choose a preset from the dropdown. */
function choose(value: string) {
  fireEvent.change(preset(), { target: { value } });
}

describe('the weekday toggles', () => {
  /*
    The regression. Two clicks inside one React batch both used to read the same
    stale rule from the `value` prop, so the first was silently dropped and a fast
    double-tap lost a day.

    Getting the *shape* of this test right is the whole difficulty. `user-event`
    awaits between clicks, and plain `fireEvent` act-wraps each call and flushes —
    both give every click its own render, so neither reproduces the bug at all and
    both passed happily against the broken code.

    The clicks have to share one `act`, which is what defers React's flush until
    all three have been handled. That is a real batch, and it is what a fast tap
    produces.
  */
  it('keeps every day when several are clicked in one batch', () => {
    render(<Harness />);
    choose('weekly');

    act(() => {
      fireEvent.click(screen.getByLabelText('Monday'));
      fireEvent.click(screen.getByLabelText('Wednesday'));
      fireEvent.click(screen.getByLabelText('Friday'));
    });

    expect(rule()).toBe('FREQ=WEEKLY;BYDAY=MO,WE,FR');
  });

  it('still works one click at a time', () => {
    render(<Harness />);
    choose('weekly');

    fireEvent.click(screen.getByLabelText('Tuesday'));
    expect(rule()).toBe('FREQ=WEEKLY;BYDAY=TU');

    fireEvent.click(screen.getByLabelText('Thursday'));
    expect(rule()).toBe('FREQ=WEEKLY;BYDAY=TU,TH');
  });

  it('removes a day that is clicked again', () => {
    render(<Harness initial="FREQ=WEEKLY;BYDAY=MO,WE" />);

    fireEvent.click(screen.getByLabelText('Monday'));
    expect(rule()).toBe('FREQ=WEEKLY;BYDAY=WE');
  });

  it('orders days the same however they were clicked', () => {
    render(<Harness />);
    choose('weekly');

    act(() => {
      fireEvent.click(screen.getByLabelText('Friday'));
      fireEvent.click(screen.getByLabelText('Monday'));
    });

    expect(rule()).toBe('FREQ=WEEKLY;BYDAY=MO,FR');
  });

  it('marks the chosen days as pressed', () => {
    render(<Harness initial="FREQ=WEEKLY;BYDAY=MO" />);

    expect(screen.getByLabelText('Monday')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Tuesday')).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('presets', () => {
  it.each([
    ['daily', 'FREQ=DAILY'],
    ['every-n-days', 'FREQ=DAILY;INTERVAL=2'],
    ['weekly', 'FREQ=WEEKLY'],
    ['every-n-weeks', 'FREQ=WEEKLY;INTERVAL=2'],
    ['monthly', 'FREQ=MONTHLY'],
  ])('%s produces %s', (chosen, expected) => {
    render(<Harness />);
    choose(chosen);
    expect(rule()).toBe(expected);
  });

  it('clears the rule entirely when set back to never', () => {
    render(<Harness initial="FREQ=DAILY" />);
    choose('never');
    expect(rule()).toBe('null');
  });

  it.each([
    ['FREQ=DAILY', 'daily'],
    ['FREQ=DAILY;INTERVAL=3', 'every-n-days'],
    ['FREQ=WEEKLY;BYDAY=MO', 'weekly'],
    ['FREQ=WEEKLY;INTERVAL=2', 'every-n-weeks'],
    ['FREQ=MONTHLY', 'monthly'],
    ['FREQ=MONTHLY;BYMONTHDAY=13', 'custom'],
  ])('reopens %s on the %s preset', (stored, expected) => {
    // Reopening an item has to show the preset you actually picked, not a guess.
    render(<Harness initial={stored} />);
    expect(preset().value).toBe(expected);
  });

  it('says what the rule means in words', () => {
    render(<Harness initial="FREQ=WEEKLY;BYDAY=MO,WE" />);
    expect(screen.getByText('Every Monday and Wednesday')).toBeInTheDocument();
  });
});

describe('the interval field', () => {
  it('changes the rule', () => {
    render(<Harness initial="FREQ=DAILY;INTERVAL=2" />);
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '5' } });
    expect(rule()).toBe('FREQ=DAILY;INTERVAL=5');
  });

  it('clamps below 2, where the preset stops meaning anything', () => {
    render(<Harness initial="FREQ=DAILY;INTERVAL=2" />);

    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '1' } });
    expect(rule()).toBe('FREQ=DAILY;INTERVAL=2');

    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '' } });
    expect(rule()).toBe('FREQ=DAILY;INTERVAL=2');
  });
});

describe('the custom rule escape hatch', () => {
  it('takes a raw RRULE', () => {
    render(<Harness initial="FREQ=MONTHLY;BYMONTHDAY=13" />);
    expect(preset().value).toBe('custom');
    expect(screen.getByDisplayValue('FREQ=MONTHLY;BYMONTHDAY=13')).toBeInTheDocument();
  });

  it('says so when the rule cannot be read, rather than failing silently', () => {
    render(<Harness initial="FREQ=MONTHLY;BYMONTHDAY=13" />);
    fireEvent.change(screen.getByDisplayValue('FREQ=MONTHLY;BYMONTHDAY=13'), {
      target: { value: 'total nonsense' },
    });

    expect(screen.getByText(/will not repeat/)).toBeInTheDocument();
  });
});

describe('the validation message', () => {
  it('shows the error it is handed', () => {
    render(<RepeatField value="FREQ=DAILY" error="Give it a date." onChange={() => {}} />);
    expect(screen.getByText('Give it a date.')).toBeInTheDocument();
  });
});
