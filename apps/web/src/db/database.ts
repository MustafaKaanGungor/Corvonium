import { addRxPlugin, createRxDatabase, type RxCollection, type RxDatabase } from 'rxdb';
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';
import type { Item, Project } from '@corvonium/shared';
import { itemSchema } from './schema/items';
import { projectSchema } from './schema/projects';

addRxPlugin(RxDBMigrationSchemaPlugin);

export type CorvoniumCollections = {
  items: RxCollection<Item>;
  projects: RxCollection<Project>;
};

export type CorvoniumDatabase = RxDatabase<CorvoniumCollections>;

let dbPromise: Promise<CorvoniumDatabase> | null = null;

export function getDatabase(): Promise<CorvoniumDatabase> {
  dbPromise ??= create();
  return dbPromise;
}

async function create(): Promise<CorvoniumDatabase> {
  const db = await createRxDatabase<CorvoniumCollections>({
    name: 'corvonium',
    storage: await createStorage(),
    multiInstance: true,
    eventReduce: true,
  });

  await db.addCollections({
    items: {
      schema: itemSchema,
      migrationStrategies: {},
    },
    projects: {
      schema: projectSchema,
      migrationStrategies: {},
    },
  });

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
