import {
  createItem,
  statusPatch,
  type Item,
  type ItemEdit,
  type ItemStatus,
  type NewItem,
} from '@corvonium/shared';
import { getDatabase } from './database';

async function patch(id: string, fields: Partial<Item>): Promise<void> {
  const db = await getDatabase();
  const doc = await db.items.findOne(id).exec();
  if (!doc) return;
  await doc.incrementalPatch({ ...fields, updatedAt: Date.now() });
}

export async function addItem(input: NewItem): Promise<void> {
  const db = await getDatabase();
  await db.items.insert(createItem(input, Date.now(), crypto.randomUUID()));
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

export async function removeItem(id: string): Promise<void> {
  const db = await getDatabase();
  const doc = await db.items.findOne(id).exec();
  await doc?.remove();
}
