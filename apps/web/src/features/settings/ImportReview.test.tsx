import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { CollectionComparison, Comparison } from '@corvonium/shared';
import { ImportReview } from './ImportReview';

const T0 = new Date(2026, 8, 14, 18, 0).getTime();

function side(over: Partial<CollectionComparison> = {}): CollectionComparison {
  return {
    here: 0,
    inFile: 0,
    onlyHere: 0,
    onlyInFile: 0,
    same: 0,
    newerInFile: 0,
    newerHere: 0,
    lastChangeHere: null,
    lastChangeInFile: null,
    ...over,
  };
}

/** Device has 48 items, the file 52: 6 only in the file, 2 only here, 1 newer here. */
const DIFFERENT: Comparison = {
  items: side({ here: 48, inFile: 52, onlyInFile: 6, onlyHere: 2, newerHere: 1, same: 45 }),
  projects: side({ here: 4, inFile: 4, same: 4 }),
  sessions: side({ here: 21, inFile: 19, onlyHere: 2, same: 19 }),
};

function setup(comparison = DIFFERENT) {
  const handlers = {
    onMerge: vi.fn(),
    onReplace: vi.fn(),
    onExportFirst: vi.fn(),
    onCancel: vi.fn(),
  };
  render(<ImportReview comparison={comparison} exportedAt={T0} busy={false} {...handlers} />);
  return handlers;
}

/** A table row's cell texts, found by its label. */
const row = (name: string) =>
  within(screen.getByRole('row', { name: new RegExp(`^${name}`) }))
    .getAllByRole('cell')
    .map((c) => c.textContent);

describe('showing both sides', () => {
  it('puts the device and the file side by side', () => {
    setup();
    expect(row('Items')).toEqual(['Items', '48', '52']);
    expect(row('Sessions')).toEqual(['Sessions', '21', '19']);
  });

  it('says what a merge will do in words', () => {
    setup();
    expect(screen.getByRole('button', { name: /^Merge/ })).toHaveTextContent(
      'Adds 6 items, keeps 2 items and 2 sessions only here, keeps the newer version of anything edited on both. Nothing is deleted.',
    );
  });

  it('offers only Close when there is nothing to import', () => {
    const same: Comparison = {
      items: side({ here: 3, inFile: 3, same: 3 }),
      projects: side(),
      sessions: side(),
    };
    const { onCancel } = setup(same);

    expect(screen.getByText(/matches this device exactly/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Merge/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onCancel).toHaveBeenCalled();
  });
});

describe('the three choices', () => {
  it('merges in one tap', () => {
    const { onMerge } = setup();
    fireEvent.click(screen.getByRole('button', { name: /^Merge/ }));
    expect(onMerge).toHaveBeenCalledOnce();
  });

  it('keeps the device without writing anything', () => {
    const { onCancel, onMerge, onReplace } = setup();
    fireEvent.click(screen.getByRole('button', { name: /^Keep this device/ }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onMerge).not.toHaveBeenCalled();
    expect(onReplace).not.toHaveBeenCalled();
  });

  it('never replaces on the first tap, and names what would be lost', () => {
    const { onReplace } = setup();
    fireEvent.click(screen.getByRole('button', { name: /^Use the file/ }));

    expect(onReplace).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        'You will lose 2 items and 2 sessions only on this device, and newer edits to 1 item.',
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Yes, replace everything' }));
    expect(onReplace).toHaveBeenCalledOnce();
  });

  it('offers a backup of this device before replacing, and a way back', () => {
    const { onExportFirst, onReplace } = setup();
    fireEvent.click(screen.getByRole('button', { name: /^Use the file/ }));

    fireEvent.click(screen.getByRole('button', { name: 'Export this device first' }));
    expect(onExportFirst).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('button', { name: /^Merge/ })).toBeInTheDocument();
    expect(onReplace).not.toHaveBeenCalled();
  });
});
