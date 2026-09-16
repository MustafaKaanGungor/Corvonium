import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { endOfLocalDay, expandAll, localDate, type Item } from '@corvonium/shared';
import * as db from '../../db/items';
import type { ItemDraft } from './ItemForm';
import { useItemSheet } from './useItemSheet';

vi.mock('../../db/items', () => ({
  addItem: vi.fn(),
  cancelSeries: vi.fn(),
  editItem: vi.fn(),
  editSeries: vi.fn(),
  removeItem: vi.fn(),
  setStatus: vi.fn(),
}));

/** 2026-09-08 09:00, a Tuesday. */
const NOW = new Date(2026, 8, 8, 9, 0).getTime();

function item(over: Partial<Item> = {}): Item {
  return {
    id: 'plain',
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
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

const plain = item();
const series = item({
  id: 'bins',
  title: 'Take the bins out',
  rrule: 'FREQ=DAILY',
  due: new Date(2026, 8, 1, 23, 59).getTime(),
});
const ITEMS = [plain, series];
const draft = { title: 'Changed' } as ItemDraft;

/** Today's occurrence of the series, exactly as the app would render it. */
function todaysOccurrence(visible: Item[]): Item {
  const found = visible.find(
    (i) => i.seriesId === 'bins' && i.due !== null && localDate(i.due) === '2026-09-08',
  );
  if (found === undefined) throw new Error('fixture: no occurrence of the series today');
  return found;
}

function setup(items: Item[] = ITEMS) {
  return renderHook((props) => useItemSheet(props.items, expandAll(props.items, NOW)), {
    initialProps: { items },
  });
}

beforeEach(() => vi.clearAllMocks());

describe('something that repeats asks first', () => {
  it('holds a save until you choose which occurrences, and writes nothing meanwhile', () => {
    const { result } = setup();
    const occurrence = todaysOccurrence(expandAll(ITEMS, NOW));

    act(() => result.current.openItem(occurrence));
    act(() => result.current.save(draft));

    expect(result.current.pending).toEqual({ verb: 'Save', draft });
    expect(result.current.open).toBe(true);
    expect(db.editItem).not.toHaveBeenCalled();
    expect(db.editSeries).not.toHaveBeenCalled();

    act(() => result.current.applyScope('one'));

    expect(db.editSeries).toHaveBeenCalledWith(
      expect.objectContaining({ id: occurrence.id }),
      expect.objectContaining({ id: 'bins' }),
      'one',
      draft,
    );
    expect(result.current.open).toBe(false);
  });

  it('holds a cancel the same way', () => {
    const { result } = setup();
    act(() => result.current.openItem(todaysOccurrence(expandAll(ITEMS, NOW))));
    act(() => result.current.setStatus('cancelled'));

    expect(result.current.pending).toEqual({ verb: 'Cancel' });
    expect(db.setStatus).not.toHaveBeenCalled();

    act(() => result.current.applyScope('all'));
    expect(db.cancelSeries).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'bins' }),
      'all',
    );
  });

  it('can go back to the form without writing anything', () => {
    const { result } = setup();
    act(() => result.current.openItem(todaysOccurrence(expandAll(ITEMS, NOW))));
    act(() => result.current.save(draft));
    act(() => result.current.dropPending());

    expect(result.current.pending).toBeNull();
    expect(result.current.open).toBe(true);
    expect(db.editSeries).not.toHaveBeenCalled();
  });

  it('deletes the series, since an occurrence has no document of its own', () => {
    const { result } = setup();
    act(() => result.current.openItem(todaysOccurrence(expandAll(ITEMS, NOW))));
    act(() => result.current.remove());

    expect(db.removeItem).toHaveBeenCalledWith('bins');
  });
});

describe('something that does not repeat', () => {
  it('saves straight away and closes', () => {
    const { result } = setup();
    act(() => result.current.openItem(plain));
    act(() => result.current.save(draft));

    expect(db.editItem).toHaveBeenCalledWith('plain', draft);
    expect(result.current.pending).toBeNull();
    expect(result.current.open).toBe(false);
  });
});

describe('an item removed while its editor is open', () => {
  /*
    The regression this guards: holding the clicked object instead of its id meant
    saving wrote a stale snapshot back — resurrecting an item deleted elsewhere
    (another tab today, another device once sync exists).
  */
  it('closes the sheet instead of editing a ghost', () => {
    const { result, rerender } = setup();
    act(() => result.current.openItem(plain));
    expect(result.current.editing?.id).toBe('plain');

    rerender({ items: [series] });

    expect(result.current.editing).toBeNull();
    expect(result.current.open).toBe(false);

    act(() => result.current.save(draft));
    expect(db.editItem).not.toHaveBeenCalled();
  });
});

describe('adding', () => {
  it('prefills a deadline at the end of the day it was opened for', () => {
    const { result } = setup();
    act(() => result.current.startAdding('2026-09-20'));

    expect(result.current.open).toBe(true);
    expect(result.current.addPrefill).toEqual({ due: endOfLocalDay('2026-09-20') });
  });

  it('prefills nothing when opened without a day', () => {
    const { result } = setup();
    act(() => result.current.startAdding());

    expect(result.current.open).toBe(true);
    expect(result.current.addPrefill).toBeUndefined();
  });
});
