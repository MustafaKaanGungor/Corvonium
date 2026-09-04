import { useEffect, useState } from 'react';
import type { Item, Project } from '@corvonium/shared';
import { getDatabase } from './database';

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

export function useItems(): Query<Item> {
  const [data, setData] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let sub: { unsubscribe(): void } | undefined;

    getDatabase()
      .then((db) => {
        if (cancelled) return;
        sub = db.items.find().$.subscribe({
          next: (docs) => setData(docs.map((doc) => doc.toJSON() as Item)),
          error: (err) => {
            console.error('[corvonium] items query failed', err);
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
  }, []);

  return { data, error };
}

export function useProjects(): Query<Project> {
  const [data, setData] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let sub: { unsubscribe(): void } | undefined;

    getDatabase()
      .then((db) => {
        if (cancelled) return;
        sub = db.projects.find().$.subscribe({
          next: (docs) => setData(docs.map((doc) => doc.toJSON() as Project)),
          error: (err) => {
            console.error('[corvonium] projects query failed', err);
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
  }, []);

  return { data, error };
}
