import {
  createItem,
  importantForGroup,
  keyAtIndex,
  keyAtTop,
  statusPatch,
  type Item,
  type ItemEdit,
  type ItemStatus,
  type MatrixGroup,
  type NewItem,
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
  return setStatus(item.id, item.status === 'done' ? 'open' : 'done');
}

/** Tombstone via RxDB's `_deleted`, never a hard delete. */
export async function removeItem(id: string): Promise<void> {
  const db = await getDatabase();
  const doc = await db.items.findOne(id).exec();
  await doc?.remove();
}
