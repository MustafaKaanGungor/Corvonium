import { useEffect, useState } from 'react';
import { createItem, type Item, type NewItem } from '@corvonium/shared';
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

export async function addItem(input: NewItem): Promise<void> {
  const db = await getDatabase();
  await db.items.insert(createItem(input, Date.now(), crypto.randomUUID()));
}