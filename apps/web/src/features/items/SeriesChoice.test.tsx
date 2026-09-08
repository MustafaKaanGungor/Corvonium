import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Item, SeriesScope } from '@corvonium/shared';
import { SeriesChoice } from './SeriesChoice';

const occurrence = {
  id: 'i1:1757278740000',
  title: 'Take the bins out',
  rrule: 'FREQ=WEEKLY;BYDAY=MO,WE',
  seriesId: 'i1',
  originalStart: new Date(2026, 8, 9, 23, 59).getTime(),
} as Item;

function setup(verb: 'Save' | 'Cancel' = 'Cancel') {
  const onChoose = vi.fn<(scope: SeriesScope) => void>();
  const onCancel = vi.fn();
  render(
    <SeriesChoice occurrence={occurrence} verb={verb} onCancel={onCancel} onChoose={onChoose} />,
  );
  return { onChoose, onCancel };
}

const click = (label: string | RegExp) =>
  fireEvent.click(screen.getByRole('button', { name: label }));

describe('the three scopes', () => {
  // Each button has to report the scope it names — getting this wrong would
  // silently destroy the wrong occurrences, which is why it is worth pinning.
  it.each([
    [/^Just this one/, 'one'],
    [/^This and all future/, 'future'],
    [/^All of them/, 'all'],
  ] as const)('%s reports "%s"', (label, scope) => {
    const { onChoose } = setup();
    click(label);
    expect(onChoose).toHaveBeenCalledWith(scope);
  });

  it('offers exactly three, with no way to stop being asked', () => {
    setup();
    // §2.4: the prompt appears every time — a "don't ask again" here would be a
    // regression against a deliberate decision, not a missing convenience.
    expect(screen.queryByText(/don't ask|do not ask/i)).not.toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(4); // three scopes + Never mind
  });

  it('backs out without choosing anything', () => {
    const { onCancel, onChoose } = setup();
    click('Never mind');

    expect(onCancel).toHaveBeenCalled();
    expect(onChoose).not.toHaveBeenCalled();
  });
});

describe('what it tells you', () => {
  it('names the item and reads the rule in words', () => {
    setup();
    expect(screen.getByText('Take the bins out')).toBeInTheDocument();
    expect(screen.getByText(/Every Monday and Wednesday/)).toBeInTheDocument();
  });

  it('says which occurrence you acted on', () => {
    setup();
    expect(screen.getByText(/this one is 09\/09\/2026/)).toBeInTheDocument();
  });

  it('asks differently for a save than for a cancel', () => {
    setup('Save');
    expect(screen.getByText('Which occurrences should this change?')).toBeInTheDocument();
  });

  it('asks which ones you mean when cancelling', () => {
    setup('Cancel');
    expect(screen.getByText('Which ones do you mean?')).toBeInTheDocument();
  });
});
