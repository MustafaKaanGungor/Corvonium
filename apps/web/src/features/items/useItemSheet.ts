import { useState } from 'react';
import {
  endOfLocalDay,
  type Item,
  type ItemEdit,
  type ItemStatus,
  type SeriesScope,
} from '@corvonium/shared';
import {
  addItem,
  cancelSeries,
  editItem,
  editSeries,
  removeItem,
  setStatus as writeStatus,
} from '../../db/items';
import type { ItemDraft } from './ItemForm';

/** A change to something that repeats, held until you say which occurrences it means. */
export type PendingChange = { verb: 'Save'; draft: ItemDraft } | { verb: 'Cancel' };

/**
 * The add/edit sheet: what is open, and what each action writes.
 *
 * Lifted out of App so the shell only lays things out. Both rules below were
 * learned the hard way, and they travel with this state rather than with a screen.
 *
 * @param items   the stored documents — a series is looked up here
 * @param visible the expanded list — an occurrence is looked up here
 */
export function useItemSheet(items: Item[] | null, visible: Item[] | null) {
  // A day key when the calendar opened the form, so it can prefill the date.
  const [adding, setAdding] = useState<string | true | null>(null);

  /*
    An id, not an `Item`. Holding the object would hold a *snapshot* taken when the
    row was clicked: if the item is removed while its editor is open, saving would
    write that stale object back and resurrect a deleted row. Looking it up in the
    live array each render means `editing` goes null instead and the sheet closes.

    This does not re-seed an open form from a live change — `ItemForm` seeds its
    state from `initial` and is keyed by id, so fields never move under the cursor
    mid-edit. That is deliberate.
  */
  const [editingId, setEditingId] = useState<string | null>(null);

  // A pending change to something that repeats, held until the scope is chosen.
  const [pending, setPending] = useState<PendingChange | null>(null);

  const editing = editingId === null ? null : (visible?.find((i) => i.id === editingId) ?? null);

  /** The stored document an occurrence belongs to, for the three-way choice. */
  const series =
    editing?.seriesId == null ? null : (items?.find((i) => i.id === editing.seriesId) ?? null);

  /** The calendar's selected day as starting values — a deadline that evening. */
  const addPrefill: ItemEdit | undefined =
    typeof adding === 'string' ? { due: endOfLocalDay(adding) ?? undefined } : undefined;

  function close() {
    setAdding(null);
    setEditingId(null);
    setPending(null);
  }

  return {
    open: adding !== null || editing !== null,
    editing,
    series,
    pending,
    addPrefill,

    /** Open the add form, prefilled with `day` when one is given. */
    startAdding(day?: string | null) {
      setAdding(day ?? true);
    },
    openItem(item: Item) {
      setEditingId(item.id);
    },
    close,

    add(draft: ItemDraft) {
      void addItem(draft);
      close();
    },

    save(draft: ItemDraft) {
      if (editing === null) return;
      // Anything that repeats asks which occurrences it means first.
      if (series !== null) return setPending({ verb: 'Save', draft });
      void editItem(editing.id, draft);
      close();
    },

    setStatus(status: ItemStatus) {
      if (editing === null) return;
      if (series !== null && status === 'cancelled') return setPending({ verb: 'Cancel' });
      void writeStatus(editing.id, status);
      close();
    },

    remove() {
      if (editing === null) return;
      // Deleting reaches the real document: an occurrence has none of its own, so
      // the series is what there is to delete.
      void removeItem(series?.id ?? editing.id);
      close();
    },

    /** Back from the three-way choice to the form, nothing written. */
    dropPending() {
      setPending(null);
    },

    /**
     * Apply a held change once its scope is known. `editing` is the occurrence you
     * acted on and `series` the document behind it — both are needed, because
     * "just this one" writes an override while the other two touch the series.
     */
    applyScope(scope: SeriesScope) {
      if (editing === null || series === null || pending === null) return;

      if (pending.verb === 'Cancel') void cancelSeries(editing, series, scope);
      else void editSeries(editing, series, scope, pending.draft);

      close();
    },
  };
}

export type ItemSheetState = ReturnType<typeof useItemSheet>;
