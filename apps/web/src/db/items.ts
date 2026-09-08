import {
  createItem,
  endSeriesBefore,
  importantForGroup,
  keyAtIndex,
  keyAtTop,
  statusPatch,
  type Item,
  type ItemEdit,
  type ItemStatus,
  type MatrixGroup,
  type NewItem,
  type SeriesScope,
} from '@corvonium/shared';
import { getDatabase } from './database';

/**
 * The single point of mutation. Stamps `updatedAt` on every call so that
 * "updatedAt on every mutation" (plan §6) cannot be forgotten at a call site.
 */
async function patch(id: string, fields: Partial<Item>): Promise<void> {
  const db = await getDatabase();
  const doc = await db.items.findOne(id).exec();
  if (!doc) return;
  await doc.incrementalPatch({ ...fields, updatedAt: Date.now() });
}

export async function addItem(input: NewItem): Promise<void> {
  const db = await getDatabase();

  // New items enter at the top of their group — plan §3.4.
  const existing = await db.items.find().exec();
  const sortOrder = keyAtTop(existing.map((doc) => doc.sortOrder));

  await db.items.insert(createItem({ sortOrder, ...input }, Date.now(), crypto.randomUUID()));
}

/**
 * Place `item` at `index` among `neighbourKeys` — the target group's `sortOrder`
 * values in display order, with this item already removed.
 *
 * Dropping into a different group also flips `important`, the only group input a
 * drag can set (§3.4). Routine is never a cross-group target, so its `null` is
 * simply skipped.
 *
 * One `patch` call: that is the payoff of fractional indexing — a reorder is a
 * single-document write, so last-write-wins cannot scramble the list.
 */
export async function moveItem(
  item: Item,
  targetGroup: MatrixGroup,
  neighbourKeys: string[],
  index: number,
): Promise<void> {
  const fields: Partial<Item> = { sortOrder: keyAtIndex(neighbourKeys, index) };

  const important = importantForGroup(targetGroup);
  if (important !== null && important !== item.important) fields.important = important;

  await patch(item.id, fields);
}

export function editItem(id: string, input: ItemEdit): Promise<void> {
  return patch(id, input);
}

export function setStatus(id: string, status: ItemStatus): Promise<void> {
  return patch(id, statusPatch(status, Date.now()));
}

export function toggleDone(item: Item): Promise<void> {
  const next = item.status === 'done' ? 'open' : 'done';

  // An occurrence has no document of its own until it is touched, so ticking one
  // writes its override rather than patching an id that does not exist.
  if (item.seriesId !== null) return setOccurrenceStatus(item, next);

  return setStatus(item.id, next);
}

/* -------------------------------------------------------------------------- */
/* recurrence — §2.4                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Write the override document that stands for one occurrence.
 *
 * An occurrence usually has no row at all: it is computed. Touching one is what
 * makes it real, and the override is deliberately small — the series stays one
 * document and only the occurrences you actually changed cost anything.
 *
 * If this occurrence already has an override, this edits it rather than writing a
 * second one for the same instant.
 */
async function upsertOverride(occurrence: Item, fields: Partial<Item>): Promise<void> {
  if (occurrence.seriesId === null || occurrence.originalStart === null) return;

  const db = await getDatabase();
  const existing = await db.items
    .findOne({
      selector: { seriesId: occurrence.seriesId, originalStart: occurrence.originalStart },
    })
    .exec();

  if (existing) {
    await existing.incrementalPatch({ ...fields, updatedAt: Date.now() });
    return;
  }

  await db.items.insert(
    createItem(
      {
        ...occurrence,
        // The virtual id is derived from the series; a stored row needs its own.
        // And an override is a single instance, so it carries no rule of its own.
        rrule: null,
        ...fields,
      },
      Date.now(),
      crypto.randomUUID(),
    ),
  );
}

/** Complete or cancel a single occurrence. */
export function setOccurrenceStatus(occurrence: Item, status: ItemStatus): Promise<void> {
  return upsertOverride(occurrence, statusPatch(status, Date.now()));
}

/**
 * Cancel a recurring item, at one of the three scopes §2.4 requires.
 *
 * `future` needs no override: `UNTIL` lands on the day before this occurrence, so
 * this one and everything after it simply stop being expanded, and history before
 * it is untouched.
 */
export async function cancelSeries(
  occurrence: Item,
  series: Item,
  scope: SeriesScope,
): Promise<void> {
  if (scope === 'one') return setOccurrenceStatus(occurrence, 'cancelled');
  if (scope === 'all') return setStatus(series.id, 'cancelled');

  if (series.rrule === null || occurrence.originalStart === null) return;
  await patch(series.id, { rrule: endSeriesBefore(series.rrule, occurrence.originalStart) });
}

/**
 * Edit a recurring item, at the same three scopes — §2.4 is explicit that editing
 * needs the identical choice, which is why this mirrors `cancelSeries` exactly.
 *
 * `future` is the one that is not a patch: the old series is stopped the day
 * before, and a **new series** starts at this occurrence carrying the edit. That
 * is what "this and all following" means, and splitting the document is the only
 * way to say it without rewriting history.
 */
export async function editSeries(
  occurrence: Item,
  series: Item,
  scope: SeriesScope,
  input: ItemEdit,
): Promise<void> {
  if (scope === 'one') return upsertOverride(occurrence, input);
  if (scope === 'all') return patch(series.id, input);

  if (series.rrule === null || occurrence.originalStart === null) return;

  const db = await getDatabase();
  await patch(series.id, { rrule: endSeriesBefore(series.rrule, occurrence.originalStart) });

  await db.items.insert(
    createItem(
      {
        ...occurrence, // the occurrence's own dates become the new series' anchor
        ...input,
        rrule: series.rrule,
        seriesId: null,
        originalStart: null,
      },
      Date.now(),
      crypto.randomUUID(),
    ),
  );
}

/** Tombstone via RxDB's `_deleted`, never a hard delete. */
export async function removeItem(id: string): Promise<void> {
  const db = await getDatabase();
  const doc = await db.items.findOne(id).exec();
  await doc?.remove();
}
