import { useState } from 'react';
import type { Item } from '@corvonium/shared';
import { useItems, useProjects } from './db/hooks';
import { addItem, editItem, removeItem, setStatus } from './db/items';
import { useNow } from './lib/useNow';
import { useRoute } from './lib/router';
import { NavBar } from './components/NavBar';
import { TopBar } from './components/TopBar';
import { Sheet } from './components/Sheet';
import { ItemForm } from './features/items/ItemForm';
import { SettingsSheet } from './features/settings/SettingsSheet';
import { TasksScreen } from './features/tasks/TasksScreen';
import { TodayView } from './features/today/TodayView';

function Placeholder({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
      <h1 className="text-xl font-bold tracking-tight">{title}</h1>
      <p className="max-w-[34ch] text-sm text-[#5F6E66]">{detail}</p>
    </div>
  );
}

export default function App() {
  const { screen, params } = useRoute();
  const { data: items, error: itemsError } = useItems();
  const { data: projects } = useProjects();
  const now = useNow();

  const [adding, setAdding] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  /*
    An id, not an `Item`. Holding the object would hold a *snapshot* taken when the
    row was clicked: if the item is removed while its editor is open, saving would
    write that stale object back and resurrect a deleted row. Looking it up in the
    live array each render means `editing` goes null instead and the sheet closes.

    This does not re-seed an open form from a live change — `ItemForm` seeds its
    state from `initial` and is keyed by id, so fields never move under the cursor
    mid-edit. That is deliberate.
  */
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = editingId === null ? null : (items?.find((i) => i.id === editingId) ?? null);

  const itemSheetOpen = adding || editing !== null;

  function closeItemSheet() {
    setAdding(false);
    setEditingId(null);
  }

  const openItem = (item: Item) => setEditingId(item.id);

  const showsList = screen === 'today' || screen === 'tasks';

  return (
    <div className="flex h-dvh flex-col bg-[#0A0E0C] text-[#E8EFE9]">
      <TopBar
        current={screen}
        onAdd={() => setAdding(true)}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {/* Each screen owns its width: the 2x2 needs more room than a list does. */}
      <main className="min-h-0 w-full flex-1">
        {itemsError !== null ? (
          <div className="p-5">
            <p className="rounded-lg border border-[#D9614F]/40 bg-[#D9614F]/10 p-4 text-sm text-[#D9614F]">
              Could not open your data: {itemsError}
              <br />
              <span className="text-[#8A9990]">
                Your items are safe on this device. Try reloading.
              </span>
            </p>
          </div>
        ) : showsList && items === null ? (
          <p className="p-5 text-sm text-[#5F6E66]">Loading&hellip;</p>
        ) : screen === 'today' ? (
          <TodayView
            items={items ?? []}
            projects={projects ?? []}
            now={now}
            onOpen={openItem}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        ) : screen === 'tasks' ? (
          <TasksScreen
            items={items ?? []}
            projects={projects ?? []}
            now={now}
            params={params}
            onOpen={openItem}
          />
        ) : screen === 'calendar' ? (
          <Placeholder
            title="Calendar"
            detail="The month grid, Plan and Effort modes. Block 6 — it needs the recurrence and lane-assignment engines first."
          />
        ) : (
          <Placeholder
            title="Stats"
            detail="Where your time went, aggregated from work sessions. Block 4, once Work Mode is recording them."
          />
        )}
      </main>

      {/*
        Tasks only. Today's primary action is Start the Day (§3.3) and a floating
        button there lands on top of it; the calendar gets one when it is built.
      */}
      {screen === 'tasks' && itemsError === null && (
        <button
          onClick={() => setAdding(true)}
          aria-label="Add item"
          // Inset from the edge: Android reads a back-swipe from both screen sides.
          className="absolute right-5 bottom-[74px] grid h-13 w-13 md:hidden place-items-center rounded-full bg-[#4CC26A] pb-0.5 text-2xl text-[#06210F] shadow-lg shadow-[#4CC26A]/30"
        >
          +
        </button>
      )}

      <NavBar current={screen} />

      <Sheet open={itemSheetOpen} onClose={closeItemSheet}>
        {itemSheetOpen && (
          <ItemForm
            key={editing?.id ?? 'new'}
            initial={editing ?? undefined}
            projects={projects ?? []}
            onSubmit={(draft) => {
              if (editing) editItem(editing.id, draft);
              else addItem(draft);
              closeItemSheet();
            }}
            onClose={closeItemSheet}
            onSetStatus={(status) => {
              if (!editing) return;
              setStatus(editing.id, status);
              closeItemSheet();
            }}
            onDelete={() => {
              if (!editing) return;
              removeItem(editing.id);
              closeItemSheet();
            }}
          />
        )}
      </Sheet>

      <Sheet open={settingsOpen} onClose={() => setSettingsOpen(false)}>
        {settingsOpen && (
          <SettingsSheet projects={projects ?? []} onClose={() => setSettingsOpen(false)} />
        )}
      </Sheet>
    </div>
  );
}
