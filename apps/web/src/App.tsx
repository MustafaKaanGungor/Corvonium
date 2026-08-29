import { localDate, type Item } from '@corvonium/shared';
import { useItems } from './db/hooks';
import { useNow } from './lib/useNow';
import { addItem, editItem } from './db/items';
import { useState } from 'react';
import { ItemForm } from './features/items/ItemForm';
import { TaskView } from './features/tasks/TaskView';
import { Sheet } from './components/Sheet';
import type { TimeFilter } from '@corvonium/shared';
import { FilterRow } from './features/tasks/FilterRow';


export default function App() {
  const items = useItems();
  const now = useNow();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const sheetOpen = adding || editing !== null;
  const [filter, setFilter] = useState<TimeFilter>('all');

  function close() {
    setAdding(false);
    setEditing(null);
  }

  return (
    <div className="min-h-dvh bg-[#0A0E0C] text-[#E8EFE9] p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">
          Corvo<span className="text-[#4CC26A]">nium</span>
        </h1>
        <p className="text-sm text-[#8A9990]">{localDate(now)}</p>
      </header>

      <button
        onClick={() => setAdding(true)}
        className="rounded-lg bg-[#4CC26A] px-4 py-2 font-semibold text-[#06210F]"
      >
        Add item
      </button>

            <div className="my-4">
        <FilterRow value={filter} onChange={setFilter} />
      </div>

      {items && <TaskView items={items} now={now} filter={filter} onOpen={setEditing} />}

      <Sheet open={sheetOpen} onClose={close}>
        {sheetOpen && (
        <ItemForm
        key={editing?.id ?? 'new'}
        initial={editing ?? undefined}
        onSubmit={(draft) => {
          if (editing) editItem(editing.id, draft);
          else addItem(draft);
          close();
        }}
        onCancel={close}
        />
      )}
      </Sheet>
    </div>
  );
}
