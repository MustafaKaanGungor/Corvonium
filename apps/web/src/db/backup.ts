import type { RxCollection } from 'rxdb';
import type { SchemaVersions, Snapshot } from '@corvonium/shared';
import { getDatabase } from './database';
import { itemSchema } from './schema/items';
import { projectSchema } from './schema/projects';
import { sessionSchema } from './schema/sessions';

/**
 * Backups at the database edge. Every decision — what a file means, how it
 * differs, what a merge writes — is made in `@corvonium/shared/backup`; this only
 * reads and writes.
 */

/** What this build stores. A backup carries the versions it was made under. */
export const SCHEMA_VERSIONS: SchemaVersions = {
  items: itemSchema.version,
  projects: projectSchema.version,
  sessions: sessionSchema.version,
};

async function all<T>(collection: RxCollection<T>): Promise<T[]> {
  const docs = await collection.find().exec();
  return docs.map((doc) => doc.toJSON() as T);
}

/** Every stored document. Deleted ones are tombstones and are not included. */
export async function readSnapshot(): Promise<Snapshot> {
  const db = await getDatabase();
  const [items, projects, sessions] = await Promise.all([
    all(db.items),
    all(db.projects),
    all(db.sessions),
  ]);
  return { items, projects, sessions };
}

/** RxDB reports bulk failures per document instead of throwing; a partial write is a failure. */
function assertWritten(result: { error: unknown[] }, what: string) {
  if (result.error.length > 0) {
    console.error(`[corvonium] ${what} failed`, result.error);
    throw new Error(`${result.error.length} documents could not be written.`);
  }
}

async function upsert<T extends { id: string }>(collection: RxCollection<T>, docs: T[]) {
  if (docs.length === 0) return;
  // Also resurrects a tombstoned id — which is what importing a deleted item means.
  assertWritten(await collection.bulkUpsert(docs), 'upsert');
}

/** Make the collection hold exactly `docs`: remove what they lack, write the rest. */
async function replace<T extends { id: string }>(collection: RxCollection<T>, docs: T[]) {
  const keep = new Set(docs.map((d) => d.id));
  const current = await collection.find().exec();
  const stale = current.filter((doc) => !keep.has(doc.primary));

  if (stale.length > 0) assertWritten(await collection.bulkRemove(stale), 'remove');
  await upsert(collection, docs);
}

/** Write a merge's documents. Nothing is removed. */
export async function applyMerge(writes: Snapshot): Promise<void> {
  const db = await getDatabase();
  await upsert(db.items, writes.items);
  await upsert(db.projects, writes.projects);
  await upsert(db.sessions, writes.sessions);
}

async function replaceAll(snapshot: Snapshot) {
  const db = await getDatabase();
  await replace(db.items, snapshot.items);
  await replace(db.projects, snapshot.projects);
  await replace(db.sessions, snapshot.sessions);
}

/**
 * Make this device hold exactly what the file holds.
 *
 * IndexedDB gives no transaction across collections here, so a failure part-way
 * would leave a mix of both. `device` — read just before — is put back if so:
 * a failed replace should leave you where you started, not with half of each.
 */
export async function applyReplace(file: Snapshot, device: Snapshot): Promise<void> {
  try {
    await replaceAll(file);
  } catch (err) {
    try {
      await replaceAll(device);
    } catch (restoreErr) {
      console.error('[corvonium] could not restore after a failed replace', restoreErr);
    }
    throw err;
  }
}
