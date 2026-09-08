import { useEffect, useRef, useState } from 'react';
import {
  dayTotals,
  expandRange,
  gridRange,
  itemSpan,
  localDayKey,
  monthGrid,
  monthOf,
  shiftMonth,
  type Item,
  type Project,
  type Session,
} from '@corvonium/shared';
import { Sheet } from '../../components/Sheet';
import { useMediaQuery, DESKTOP } from '../../lib/useMediaQuery';
import { DayPanel } from './DayPanel';
import { MonthHeader, type CalendarMode } from './MonthHeader';
import { WeekRow } from './WeekRow';
import { calendarView } from './viewState';

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * How many bricks a cell can hold before `+N more`.
 *
 * §3.2 measures the phone: a ~92px cell gives 22px to the day number and 17 to
 * each lane, so three. §3.8 notes a desktop cell fits eight or more, which is what
 * turns overflow from routine into rare.
 */
const LANES_PHONE = 3;
const LANES_DESKTOP = 8;

/** A swipe has to travel this far, and be more vertical than horizontal, to count. */
const SWIPE_MIN = 60;

type Props = {
  items: Item[];
  projects: Project[];
  sessions: Session[];
  now: number;
  onOpen: (item: Item) => void;
  /** Opens the add form prefilled with a day — the calendar's selected one. */
  onAdd: (day: string) => void;
};

export function CalendarScreen({ items, projects, sessions, now, onOpen, onAdd }: Props) {
  const desktop = useMediaQuery(DESKTOP);
  const today = localDayKey(now);

  /*
    Seeded from `calendarView`, which outlives this component.

    Navigating to Tasks unmounts this screen, so plain `useState` would reset the
    mode and the selected day every time you came back — and §3.2 asks for exactly
    the opposite. See `viewState.ts` for why module scope is the right lifetime.

    The panel is *not* in there: an open sheet is a momentary thing, and coming
    back to the calendar with a day panel already up would be startling.
  */
  const [month, setMonth] = useState(() => calendarView.month ?? monthOf(today));
  const [mode, setMode] = useState<CalendarMode>(calendarView.mode);
  const [selected, setSelected] = useState(() => calendarView.selected ?? today);
  const [projectFilter, setProjectFilter] = useState<string | null>(calendarView.projectFilter);
  const [panelOpen, setPanelOpen] = useState(false);

  // Written back after every render rather than in each setter, so no change can
  // be made that forgets to record itself.
  useEffect(() => {
    calendarView.month = month;
    calendarView.mode = mode;
    calendarView.selected = selected;
    calendarView.projectFilter = projectFilter;
  });

  // Self-healing, as elsewhere: a deleted project falls back to every project.
  const project =
    projectFilter !== null && projects.some((p) => p.id === projectFilter) ? projectFilter : null;

  const days = monthGrid(month);
  const range = gridRange(month);

  /*
    The window is the *grid*, not the month — a bar starting in late August has to
    draw across the leading days of September's grid. `expandRange` rather than
    `expandAll`, whose horizon is built for lists of what needs doing.
  */
  const from = new Date(`${range.from}T00:00`).getTime();
  const to = new Date(`${range.to}T23:59:59`).getTime();

  const visible = expandRange(items, from, to)
    .filter((item) => itemSpan(item) !== null)
    .filter((item) => project === null || item.projectId === project);

  const effort = dayTotals(sessions, now);

  const weekStarts = [0, 7, 14, 21, 28, 35].map((i) => days[i] ?? month);

  function step(offset: number) {
    setMonth((current) => shiftMonth(current, offset));
  }

  function goToday() {
    setMonth(monthOf(today));
    setSelected(today);
  }

  /*
    Vertical swipe moves months, one per gesture. The day panel opens on a *tap*,
    so the two gestures never compete — which is the trade §3.2 makes to keep day
    cells from scrolling internally.
  */
  const swipe = useRef<{ x: number; y: number } | null>(null);

  function onPointerDown(e: React.PointerEvent) {
    swipe.current = { x: e.clientX, y: e.clientY };
  }

  function onPointerUp(e: React.PointerEvent) {
    const start = swipe.current;
    swipe.current = null;
    if (start === null) return;

    const dy = e.clientY - start.y;
    const dx = e.clientX - start.x;
    if (Math.abs(dy) < SWIPE_MIN || Math.abs(dy) <= Math.abs(dx)) return;

    // Swiping up moves forward, the way a scrolling list does.
    step(dy < 0 ? 1 : -1);
  }

  return (
    <div className="mx-auto flex h-full max-w-[1180px] flex-col">
      <MonthHeader
        month={month}
        mode={mode}
        projects={projects}
        projectFilter={project}
        onMonth={setMonth}
        onStep={step}
        onToday={goToday}
        onMode={setMode}
        onProjectFilter={setProjectFilter}
      />

      <div className="grid shrink-0 grid-cols-7 px-4 pt-1 pb-1.5">
        {DOW.map((name) => (
          <span key={name} className="pl-1 text-[10.5px] tracking-[0.1em] text-[#5F6E66] uppercase">
            {name}
          </span>
        ))}
      </div>

      {/*
        Six equal rows filling exactly what is left, and nothing here scrolls. The
        grid must fit the viewport — that is what forces `+N more` instead of a
        scrollable cell, since a scrolling cell would fight the swipe above.
      */}
      <div
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        className="grid min-h-0 flex-1 grid-rows-6 gap-[3px] px-4 pb-4"
      >
        {weekStarts.map((weekStart) => (
          <WeekRow
            key={weekStart}
            weekStart={weekStart}
            month={month}
            today={today}
            selected={selected}
            items={visible}
            projects={projects}
            mode={mode}
            effort={effort}
            now={now}
            maxLanes={desktop ? LANES_DESKTOP : LANES_PHONE}
            onSelect={setSelected}
            onOpenDay={(day) => {
              setSelected(day);
              setPanelOpen(true);
            }}
          />
        ))}
      </div>

      {/*
        Bottom *right*, and inset from the edge: Android reads a back-swipe from
        both screen sides, so an edge-hugging button gets swiped instead of tapped
        whichever corner it is in. It prefills the selected day — §3.2.
      */}
      <button
        onClick={() => onAdd(selected)}
        aria-label="Add item on the selected day"
        className="absolute right-5 bottom-[74px] grid h-13 w-13 place-items-center rounded-full bg-[#4CC26A] pb-0.5 text-2xl text-[#06210F] shadow-lg shadow-[#4CC26A]/30 md:hidden"
      >
        +
      </button>

      <Sheet open={panelOpen} onClose={() => setPanelOpen(false)}>
        {panelOpen && (
          <DayPanel
            day={selected}
            mode={mode}
            items={visible}
            sessions={sessions}
            projects={projects}
            now={now}
            onOpen={(item) => {
              setPanelOpen(false);
              onOpen(item);
            }}
          />
        )}
      </Sheet>
    </div>
  );
}
