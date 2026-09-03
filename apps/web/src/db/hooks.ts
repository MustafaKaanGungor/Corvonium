import { useEffect, useState } from 'react';
import type { Item, Project } from '@corvonium/shared';
import { getDatabase } from './database';

export function useItems(): Item[] | null {
  const [items, setItems] = useState<Item[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    let sub: { unsubscribe(): void } | undefined;

    getDatabase()
      .then((db) => {
        if (cancelled) return;
        sub = db.items.find().$.subscribe({
          next: (docs) => setItems(docs.map((doc) => doc.toJSON() as Item)),
          error: (err) => console.error('[corvonium] items query failed', err),
        });
      })
      .catch((err) => {
        console.error('[corvonium] database failed to open', err);
      });

    return () => {
      cancelled = true;
      sub?.unsubscribe();
    };
  }, []);

  return items;
}

export function useProjects(): Project[] | null {
  const [projects, setProjects] = useState<Project[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    let sub: { unsubscribe(): void } | undefined;

    getDatabase()
      .then((db) => {
        if (cancelled) return;
        sub = db.projects.find().$.subscribe({
          next: (docs) => setProjects(docs.map((doc) => doc.toJSON() as Project)),
          error: (err) => console.error('[corvonium] projects query failed', err),
        });
      })
      .catch((err) => console.error('[corvonium] database failed to open', err));

    return () => {
      cancelled = true;
      sub?.unsubscribe();
    };
  }, []);

  return projects;
}
