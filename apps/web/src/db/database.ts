import {
  addRxPlugin,
  createRxDatabase,
  type RxCollection,
  type RxConflictHandler,
  type RxDatabase,
  type RxStorage,
} from 'rxdb';
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie';
import { RxDBLeaderElectionPlugin } from 'rxdb/plugins/leader-election';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';
import {
  nextUpdatedAt,
  resolveConflict,
  sameDocument,
  type Item,
  type Project,
  type Session,
} from '@corvonium/shared';
import { deviceClock, type DeviceClock } from '../lib/deviceClock';
import { itemSchema } from './schema/items';
import { projectSchema } from './schema/projects';
import { sessionSchema } from './schema/sessions';

addRxPlugin(RxDBMigrationSchemaPlugin);
// Several open tabs share one database; only the leader replicates (§7).
addRxPlugin(RxDBLeaderElectionPlugin);

export type CorvoniumCollections = {
  items: RxCollection<Item>;
  projects: RxCollection<Project>;
  sessions: RxCollection<Session>;
};

export type CorvoniumDatabase = RxDatabase<CorvoniumCollections>;

let dbPromise: Promise<CorvoniumDatabase> | null = null;

export function getDatabase(): Promise<CorvoniumDatabase> {
  dbPromise ??= createStorage().then((storage) =>
    createDatabase({ name: 'corvonium', storage, multiInstance: true }),
  );
  return dbPromise;
}

/**
 * Last write wins — §7, and the rule lives in `@corvonium/shared` so it is the
 * same rule everywhere. RxDB calls this when the server refuses a push because
 * it holds a version this device never saw.
 */
function lastWriteWins<T extends { updatedAt: number }>(): RxConflictHandler<T> {
  return {
    isEqual: (a, b) => sameDocument(a, b),
    resolve: async (input) => resolveConflict(input),
  };
}

/**
 * Open the database. Parameterised so the sync tests can open two of them — two
 * devices — on in-memory storage, with exactly the rules the app runs with.
 */
export async function createDatabase(options: {
  name: string;
  // RxDB's own storage type is generic over internals the app never touches.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  storage: RxStorage<any, any>;
  multiInstance: boolean;
  /** Stamps `updatedAt` in server time. Each test "device" brings its own. */
  clock?: DeviceClock;
}): Promise<CorvoniumDatabase> {
  const clock = options.clock ?? deviceClock;

  const db = await createRxDatabase<CorvoniumCollections>({
    name: options.name,
    storage: options.storage,
    multiInstance: options.multiInstance,
    eventReduce: true,
  });

  await db.addCollections({
    items: { schema: itemSchema, migrationStrategies: {}, conflictHandler: lastWriteWins() },
    projects: { schema: projectSchema, migrationStrategies: {}, conflictHandler: lastWriteWins() },
    sessions: { schema: sessionSchema, migrationStrategies: {}, conflictHandler: lastWriteWins() },
  });

  // The hooks only touch `updatedAt`, which every collection has.
  const stamped = [db.items, db.projects, db.sessions] as unknown as RxCollection<{
    updatedAt: number;
  }>[];

  for (const collection of stamped) {
    /*
      §7, open question 2 — clock skew. Every edit is re-stamped in **server time**,
      so last-write-wins compares all devices on one clock and a device whose own
      clock runs fast cannot win conflicts it should lose. The stamp also never
      drops below the version it replaces.

      Only when the write meant to change `updatedAt`: the Work Mode heartbeat
      deliberately leaves it alone, and must keep doing so.

      Writes made *by replication* go straight to storage and skip hooks, so a
      document pulled from the server keeps exactly the stamp it arrived with.
    */
    collection.preSave((data, previous) => {
      const before = (previous as unknown as { updatedAt: number }).updatedAt;
      if (data.updatedAt !== before) data.updatedAt = nextUpdatedAt(clock.now(), before);
    }, false);

    /*
      A deletion is a write, and last-write-wins needs to know *when* it happened.
      `doc.remove()` only sets `_deleted`, which would send the tombstone out with
      the timestamp of the last edit — and any later edit on another device would
      silently bring the document back.
    */
    collection.preRemove((data) => {
      data.updatedAt = nextUpdatedAt(clock.now(), data.updatedAt);
    }, false);
  }

  return db;
}

/**
 * Dev builds get deep checks and readable errors; production gets neither,
 * and neither reaches the production bundle.
 */
async function createStorage() {
  const base = getRxStorageDexie();
  if (!import.meta.env.DEV) return base;

  const { RxDBDevModePlugin } = await import('rxdb/plugins/dev-mode');
  addRxPlugin(RxDBDevModePlugin);

  const { wrappedValidateAjvStorage } = await import('rxdb/plugins/validate-ajv');
  return wrappedValidateAjvStorage({ storage: base });
}
