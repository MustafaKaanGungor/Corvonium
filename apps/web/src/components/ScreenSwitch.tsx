import type { Item, Project, Session } from '@corvonium/shared';
import type { Screen } from '../lib/router';
import { CalendarScreen } from '../features/calendar/CalendarScreen';
import { StatsScreen } from '../features/stats/StatsScreen';
import { TasksScreen } from '../features/tasks/TasksScreen';
import { TodayView } from '../features/today/TodayView';
import { WorkScreen } from '../features/work/WorkScreen';

type Props = {
  screen: Screen;
  params: URLSearchParams;
  /** The stored documents. */
  items: Item[] | null;
  /** Occurrences expanded, for list screens. `null` until the first result. */
  visible: Item[] | null;
  itemsError: string | null;
  projects: Project[];
  sessions: Session[];
  liveSession: Session | null;
  now: number;
  onOpen: (item: Item) => void;
  onAdd: (day: string) => void;
  onOpenSettings: () => void;
};

/**
 * The main area: a database failure, the first load, or the current screen.
 *
 * Which list each screen gets is decided here, and it differs on purpose:
 * - list screens get `visible`, occurrences expanded once for all of them (§2.4) —
 *   ordinary `Item` objects with shifted dates, which is why Today, Tasks and every
 *   grouping function needed no changes at all;
 * - Work Mode gets the *raw* list: its picker attaches a series to a segment, so
 *   time on a routine accumulates across every occurrence instead of fragmenting
 *   into a separate item per day;
 * - the Calendar and Stats also take the raw list and expand over their own window.
 */
export function ScreenSwitch({
  screen,
  params,
  items,
  visible,
  itemsError,
  projects,
  sessions,
  liveSession,
  now,
  onOpen,
  onAdd,
  onOpenSettings,
}: Props) {
  if (itemsError !== null) {
    return (
      <div className="p-5">
        <p className="rounded-lg border border-[#D9614F]/40 bg-[#D9614F]/10 p-4 text-sm text-[#D9614F]">
          Could not open your data: {itemsError}
          <br />
          <span className="text-[#8A9990]">Your items are safe on this device. Try reloading.</span>
        </p>
      </div>
    );
  }

  if (items === null || visible === null) {
    return <p className="p-5 text-sm text-[#5F6E66]">Loading&hellip;</p>;
  }

  switch (screen) {
    case 'today':
      return (
        <TodayView
          items={visible}
          projects={projects}
          now={now}
          liveSession={liveSession}
          onOpen={onOpen}
          onOpenSettings={onOpenSettings}
        />
      );
    case 'tasks':
      return (
        <TasksScreen
          items={visible}
          projects={projects}
          now={now}
          params={params}
          onOpen={onOpen}
        />
      );
    case 'work':
      return <WorkScreen sessions={sessions} items={items} projects={projects} />;
    case 'calendar':
      return (
        <CalendarScreen
          items={items}
          projects={projects}
          sessions={sessions}
          now={now}
          onOpen={onOpen}
          onAdd={onAdd}
        />
      );
    default:
      return <StatsScreen sessions={sessions} items={items} projects={projects} now={now} />;
  }
}
