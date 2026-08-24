import { localDate } from '@corvonium/shared';
import { useItems } from './db/hooks';
import { useNow } from './lib/useNow';
import { addItem } from './db/items';
import { useState } from 'react';
import { ItemForm } from './features/items/ItemForm';
import { TaskView } from './features/tasks/TaskView';


export default function App() {
  const items = useItems();
  const now = useNow();
  const [adding, setAdding] = useState(false);

  return (
    <div className="min-h-dvh bg-[#0A0E0C] text-[#E8EFE9] p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">
          Corvo<span className="text-[#4CC26A]">nium</span>
        </h1>
        <p className="text-sm text-[#8A9990]">{localDate(now)}</p>
      </header>

      {adding ? (
        <ItemForm
          onSubmit={(draft) => {
            addItem(draft);
            setAdding(false);
          }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="rounded-lg bg-[#4CC26A] px-4 py-2 font-semibold text-[#06210F]"
        >
          Add item
        </button>
      )}

      {items && <TaskView items={items} now={now} />}
    </div>
  );
}
