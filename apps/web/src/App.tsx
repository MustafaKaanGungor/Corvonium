import { useState } from 'react';
import { expandAll, type Item, type SeriesScope } from '@corvonium/shared';
import { useItems, useProjects, useSessions } from './db/hooks';
import { addItem, cancelSeries, editItem, editSeries, removeItem, setStatus } from './db/items';
import { useNow } from './lib/useNow';
import { useRoute } from './lib/router';
import { NavBar } from './components/NavBar';
import { TopBar } from './components/TopBar';
import { Sheet } from './components/Sheet';
import { ItemForm, type ItemDraft } from './features/items/ItemForm';
import { SeriesChoice } from './features/items/SeriesChoice';
import { CalendarScreen } from './features/calendar/CalendarScreen';
import { calendarView } from './features/calendar/viewState';
import { SettingsSheet } from './features/settings/SettingsSheet';
import { StatsScreen } from './features/stats/StatsScreen';
import { TasksScreen } from './features/tasks/TasksScreen';
import { TodayView } from './features/today/TodayView';
import { WorkScreen } from './features/work/WorkScreen';

export default function App() {
  const { screen, params } = useRoute();
  const { data: items, error: itemsError } = useItems();
  const { data: projects } = useProjects();
  const { data: sessions } = useSessions();
  const now = useNow();

  // A day key when the calendar opened the form, so it can prefill the date.
  const [adding, setAdding] = useState<string | true | null>(null);
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

  /*
    Occurrences are expanded here, once, and every list-shaped screen renders the
    result — §2.4. They are ordinary `Item` objects with shifted dates, which is
    why Today, Tasks and every grouping function needed no changes at all.

    Work Mode deliberately keeps the *raw* list: its picker attaches a series to a
    segment, so time on a routine accumulates across every occurrence instead of
    fragmenting into a separate item per day.
  */
  const visible = items === null ? null : expandAll(items, now);
  const editing = editingId === null ? null : (visible?.find((i) => i.id === editingId) ?? null);

  /** The stored document an occurrence belongs to, for the three-way choice. */
  const series =
    editing?.seriesId == null ? null : (items?.find((i) => i.id === editing.seriesId) ?? null);

  // A pending change to something that repeats, held until the scope is chosen.
  const [pending, setPending] = useState<
    { verb: 'Save'; draft: ItemDraft } | { verb: 'Cancel' } | null
  >(null);

  const itemSheetOpen = adding !== null || editing !== null;

  function closeItemSheet() {
    setAdding(null);
    setEditingId(null);
    setPending(null);
  }

  /**
   * Apply a held change once its scope is known. `editing` is the occurrence you
   * acted on and `series` the document behind it — both are needed, because
   * "just this one" writes an override while the other two touch the series.
   */
  function applyScope(scope: SeriesScope) {
    if (editing === null || series === null || pending === null) return;

    if (pending.verb === 'Cancel') void cancelSeries(editing, series, scope);
    else void editSeries(editing, series, scope, pending.draft);

    closeItemSheet();
  }

  const openItem = (item: Item) => setEditingId(item.id);

  /**
   * §3.2: adding from the calendar prefills the **selected day**, from anywhere
   * else it prefills today.
   *
   * The desktop shell has no floating button — its Add lives in the top bar, which
   * is outside the calendar — so the day is read from the same module state that
   * lets the selection survive a tab switch.
   */
  function startAdding() {
    setAdding(screen === 'calendar' ? (calendarView.selected ?? true) : true);
  }

  const liveSession = sessions?.find((s) => s.endedAt === null) ?? null;

  return (
    <div className="flex h-dvh flex-col bg-[#0A0E0C] text-[#E8EFE9]">
      <TopBar
        current={screen}
        liveSession={liveSession}
        now={now}
        onAdd={startAdding}
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
        ) : visible === null ? (
          <p className="p-5 text-sm text-[#5F6E66]">Loading&hellip;</p>
        ) : screen === 'today' ? (
          <TodayView
            items={visible ?? []}
            projects={projects ?? []}
            now={now}
            liveSession={liveSession}
            onOpen={openItem}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        ) : screen === 'tasks' ? (
          <TasksScreen
            items={visible ?? []}
            projects={projects ?? []}
            now={now}
            params={params}
            onOpen={openItem}
          />
        ) : screen === 'work' ? (
          <WorkScreen sessions={sessions ?? []} items={items ?? []} projects={projects ?? []} />
        ) : screen === 'calendar' ? (
          <CalendarScreen
            items={items ?? []}
            projects={projects ?? []}
            sessions={sessions ?? []}
            now={now}
            onOpen={openItem}
            onAdd={(day) => setAdding(day)}
          />
        ) : (
          <StatsScreen
            sessions={sessions ?? []}
            items={items ?? []}
            projects={projects ?? []}
            now={now}
          />
        )}
      </main>

      {/*
        Tasks only. Today's primary action is Start the Day (§3.3) and a floating
        button there lands on top of it; the calendar carries its own, because its
        button prefills the *selected day* and so belongs with that state.
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
        {itemSheetOpen &&
          (pending !== null && editing !== null ? (
            <SeriesChoice
              occurrence={editing}
              verb={pending.verb}
              onCancel={() => setPending(null)}
              onChoose={applyScope}
            />
          ) : (
            <ItemForm
              key={editing?.id ?? 'new'}
              initial={editing ?? undefined}
              defaultDay={typeof adding === 'string' ? adding : undefined}
              projects={projects ?? []}
              onSubmit={(draft) => {
                // Anything that repeats asks which occurrences it means first.
                if (series !== null) return setPending({ verb: 'Save', draft });
                if (editing) editItem(editing.id, draft);
                else addItem(draft);
                closeItemSheet();
              }}
              onClose={closeItemSheet}
              onSetStatus={(status) => {
                if (!editing) return;
                if (series !== null && status === 'cancelled') {
                  return setPending({ verb: 'Cancel' });
                }
                setStatus(editing.id, status);
                closeItemSheet();
              }}
              onDelete={() => {
                if (!editing) return;
                // Deleting reaches the real document: an occurrence has none of
                // its own, so the series is what there is to delete.
                removeItem(series?.id ?? editing.id);
                closeItemSheet();
              }}
            />
          ))}
      </Sheet>

      <Sheet open={settingsOpen} onClose={() => setSettingsOpen(false)}>
        {settingsOpen && (
          <SettingsSheet projects={projects ?? []} onClose={() => setSettingsOpen(false)} />
        )}
      </Sheet>
    </div>
  );
}
