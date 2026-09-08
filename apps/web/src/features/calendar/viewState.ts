import type { CalendarMode } from './MonthHeader';

/**
 * The calendar's view state, held at **module scope**.
 *
 * §3.2: switch to Tasks and back and the calendar is as you left it; close the app
 * and reopen it and you are in Plan.
 *
 * Component state cannot do that — navigating away unmounts the screen and takes
 * its `useState` with it, so the mode resets on every tab switch. A module
 * variable lives exactly as long as the running app: a PWA resumed from the
 * background keeps it, and a cold start re-evaluates the module and loses it.
 * That is precisely the lifetime the plan asks for, which is why it must not go
 * into settings or `localStorage` — those would persist across launches and need
 * code written later to undo it.
 *
 * `null` means "not visited yet", so the first mount picks today.
 */
export const calendarView: {
  month: string | null;
  mode: CalendarMode;
  selected: string | null;
  projectFilter: string | null;
} = {
  month: null,
  mode: 'plan',
  selected: null,
  projectFilter: null,
};
