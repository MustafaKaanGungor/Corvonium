import { useEffect, useState } from 'react';
import { useItems, useProjects, useSessions } from './db/hooks';
import { resumeSync } from './db/sync';
import { useExpanded } from './lib/useExpanded';
import { useNow } from './lib/useNow';
import { usePwaUpdate } from './lib/usePwaUpdate';
import { requestPersistence } from './lib/storage';
import { useRoute } from './lib/router';
import { NavBar } from './components/NavBar';
import { ScreenSwitch } from './components/ScreenSwitch';
import { Sheet } from './components/Sheet';
import { TopBar } from './components/TopBar';
import { UpdateBar } from './components/UpdateBar';
import { calendarView } from './features/calendar/viewState';
import { ItemSheet } from './features/items/ItemSheet';
import { useItemSheet } from './features/items/useItemSheet';
import { SettingsSheet } from './features/settings/SettingsSheet';

/**
 * The shell: where the data comes from, and where everything sits.
 *
 * Deliberately layout-only. What a screen shows lives in `ScreenSwitch`, and the
 * add/edit flow — with its two hard-won rules — in `useItemSheet`.
 */
export default function App() {
  const { screen, params } = useRoute();
  const { data: items, error: itemsError } = useItems();
  const { data: projects } = useProjects();
  const { data: sessions } = useSessions();
  const now = useNow();
  const update = usePwaUpdate();

  /*
    Asked for once per launch. There is no server to restore from, so an evicted
    origin loses everything — and a browser evicts a non-persistent one without
    asking. A refusal is not an error: the app works either way, just closer to
    the edge, and Settings reports which it got.
  */
  useEffect(() => {
    void requestPersistence();
    // A device that was connected before picks sync back up on every launch.
    resumeSync();
  }, []);

  const [settingsOpen, setSettingsOpen] = useState(false);

  // Occurrences are expanded here, once a day, for every list-shaped screen.
  const visible = useExpanded(items, now);
  const sheet = useItemSheet(items, visible);

  /**
   * §3.2: adding from the calendar prefills the **selected day**, from anywhere
   * else it prefills today.
   *
   * The desktop shell has no floating button — its Add lives in the top bar, which
   * is outside the calendar — so the day is read from the same module state that
   * lets the selection survive a tab switch.
   */
  function startAdding() {
    sheet.startAdding(screen === 'calendar' ? calendarView.selected : null);
  }

  const liveSession = sessions?.find((s) => s.endedAt === null) ?? null;

  return (
    /*
      `viewport-fit=cover` in index.html lets the app draw into the notch and the
      home-indicator strip, which is what an installed app should do — so the
      shell has to pad itself back out of them. Left and right matter in
      landscape; the bottom is handled by the navbar, which is what sits there.
    */
    <div
      className="flex h-dvh flex-col bg-[#0A0E0C] text-[#E8EFE9]"
      style={{
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
        paddingTop: 'env(safe-area-inset-top)',
      }}
    >
      <TopBar
        current={screen}
        liveSession={liveSession}
        now={now}
        onAdd={startAdding}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {/* Each screen owns its width: the 2x2 needs more room than a list does. */}
      <main className="min-h-0 w-full flex-1">
        <ScreenSwitch
          screen={screen}
          params={params}
          items={items}
          visible={visible}
          itemsError={itemsError}
          projects={projects ?? []}
          sessions={sessions ?? []}
          liveSession={liveSession}
          now={now}
          onOpen={sheet.openItem}
          onAdd={sheet.startAdding}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      </main>

      {/*
        Tasks only. Today's primary action is Start the Day (§3.3) and a floating
        button there lands on top of it; the calendar carries its own, because its
        button prefills the *selected day* and so belongs with that state.
      */}
      {screen === 'tasks' && itemsError === null && (
        <button
          onClick={() => sheet.startAdding()}
          aria-label="Add item"
          // Inset from the edge: Android reads a back-swipe from both screen sides.
          // The bottom offset clears the navbar *and* the home indicator under it.
          style={{ bottom: 'calc(74px + env(safe-area-inset-bottom))' }}
          className="absolute right-5 grid h-13 w-13 md:hidden place-items-center rounded-full bg-[#4CC26A] pb-0.5 text-2xl text-[#06210F] shadow-lg shadow-[#4CC26A]/30"
        >
          +
        </button>
      )}

      {update.ready && <UpdateBar onUpdate={update.update} />}

      <NavBar current={screen} />

      <ItemSheet sheet={sheet} projects={projects ?? []} now={now} />

      <Sheet open={settingsOpen} onClose={() => setSettingsOpen(false)}>
        {settingsOpen && (
          <SettingsSheet
            projects={projects ?? []}
            now={now}
            onClose={() => setSettingsOpen(false)}
          />
        )}
      </Sheet>
    </div>
  );
}
