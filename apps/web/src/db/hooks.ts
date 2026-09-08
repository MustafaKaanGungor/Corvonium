import { useEffect, useState } from 'react';
import type { RxCollection } from 'rxdb';
import type { Item, Project, Session } from '@corvonium/shared';
import { getDatabase, type CorvoniumCollections } from './database';

/**
 * The result of a live query.
 *
 * `data === null` means the first result has not arrived; `error !== null` means it
 * never will. Keeping them apart is what stops a database failure from looking
 * exactly like a slow load.
 */
export type Query<T> = {
  data: T[] | null;
  error: string | null;
};

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Subscribe to every document in a collection.
 *
 * One implementation, three call sites. `name` is keyed to `CorvoniumCollections`,
 * so a typo is a type error and each wrapper below gets its element type inferred
 * rather than asserted.
 */
type DocOf<C> = C extends RxCollection<infer T> ? T : never;

function useCollection<K extends keyof CorvoniumCollections>(
  name: K,
): Query<DocOf<CorvoniumCollections[K]>> {
  type Doc = DocOf<CorvoniumCollections[K]>;

  const [data, setData] = useState<Doc[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let sub: { unsubscribe(): void } | undefined;

    getDatabase()
      .then((db) => {
        if (cancelled) return;

        /*
          `db[name]` is a *union* of the collections while `K` is unresolved, and
          their `subscribe` overloads do not unify. TypeScript cannot check the
          narrowing from inside a generic, so this is the one cast the shared
          implementation costs. The signature above stays honest — `Doc` is derived
          from `name`, so callers still cannot pair 'items' with `Session`.
        */
        const collection = db[name] as unknown as RxCollection<Doc>;

        sub = collection.find().$.subscribe({
          next: (docs) => setData(docs.map((doc) => doc.toJSON() as Doc)),
          error: (err) => {
            console.error(`[corvonium] ${String(name)} query failed`, err);
            setError(message(err));
          },
        });
      })
      .catch((err) => {
        console.error('[corvonium] database failed to open', err);
        if (!cancelled) setError(message(err));
      });

    return () => {
      cancelled = true;
      sub?.unsubscribe();
    };
  }, [name]);

  return { data, error };
}

export function useItems(): Query<Item> {
  return useCollection('items');
}

export function useProjects(): Query<Project> {
  return useCollection('projects');
}

export function useSessions(): Query<Session> {
  return useCollection('sessions');
}
