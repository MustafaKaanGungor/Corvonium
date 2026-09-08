import { isRoutine } from './derive';
import { localDayKey } from './sessions';
import type { Item } from './types';

/**
 * The month grid — §3.2.
 *
 * All of the difficult layout lives here as pure functions, because the two
 * genuinely hard parts (bricks that span a week boundary, and lanes that keep a
 * bar level across its whole span) are exactly the kind of thing that is painful
 * to debug by looking at a screen and easy to pin with a test.
 */

/** Days per week row, and rows per grid. Fixed — never five rows for one month. */
const DAYS = 7;
const ROWS = 6;

/** A 'YYYY-MM-DD' key back to local midnight. */
function fromKey(key: string): Date {
  const [y = 0, m = 1, d = 1] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Monday is 0, Sunday is 6 — the order the grid is drawn in. */
function weekdayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

function addDays(key: string, days: number): string {
  const d = fromKey(key);
  return localDayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() + days).getTime());
}

/**
 * The 42 day keys a month's grid shows, Monday first.
 *
 * **Always 42**, never 35: a fixed grid means the layout does not reflow between
 * months, so swiping does not make everything jump. Leading and trailing days come
 * from the neighbouring months and are drawn dimmed.
 */
export function monthGrid(month: string): string[] {
  const first = fromKey(`${month}-01`);
  const start = localDayKey(
    new Date(first.getFullYear(), first.getMonth(), 1 - weekdayIndex(first)).getTime(),
  );

  return Array.from({ length: DAYS * ROWS }, (_, i) => addDays(start, i));
}

/** The seven day keys of the week row beginning at `weekStart`. */
export function weekDays(weekStart: string): string[] {
  return Array.from({ length: DAYS }, (_, i) => addDays(weekStart, i));
}

/** The 'YYYY-MM' a key belongs to, for dimming days outside the month. */
export function monthOf(key: string): string {
  return key.slice(0, 7);
}

export type Span = { from: string; to: string };

/**
 * The days an item occupies, or `null` if nothing pins it to a date.
 *
 * Unscheduled items are never drawn on the calendar — §2.5 — and `null` is how
 * they say so. Precedence follows what the item *is*: an all-day span, then a
 * timed block, then a bare deadline, which is a single-day marker rather than a
 * bar because a deadline is an instant and not a stretch of time.
 */
export function itemSpan(item: Item): Span | null {
  if (item.allDay) {
    const from = item.startDate ?? item.endDate;
    if (from === null) return null;
    const to = item.endDate ?? item.startDate ?? from;
    return from <= to ? { from, to } : { from: to, to: from };
  }

  if (item.start !== null) {
    return { from: localDayKey(item.start), to: localDayKey(item.end ?? item.start) };
  }

  if (item.due !== null) {
    const day = localDayKey(item.due);
    return { from: day, to: day };
  }

  return null;
}

export type Brick = {
  item: Item;
  /** 1-based and inclusive — goes straight into `grid-column`. */
  colStart: number;
  /** Exclusive, so `grid-column: ${colStart} / ${colEnd}`. */
  colEnd: number;
  /** 1-based, straight into `grid-row`. */
  lane: number;
  /** The item began before this week row, so the left edge is squared off. */
  continuesLeft: boolean;
  /** It runs past this row, so the right edge is squared off. */
  continuesRight: boolean;
};

/**
 * Order bricks are given lanes in, which is the order they appear top to bottom.
 *
 * **Routines sort last**, so a daily habit takes a high lane and is the first
 * thing pushed into `+N more` while one-off commitments keep the visible rows. A
 * routine alone in a cell still lands in lane 1 — it only ever yields to something
 * it is actually competing with.
 *
 * Within each group: earliest first, then longest span, which is what stops a long
 * bar being forced downward by short ones that started on the same day. `id` last
 * only so the result is deterministic.
 */
function compare(a: Brick, b: Brick): number {
  const routine = Number(isRoutine(a.item)) - Number(isRoutine(b.item));
  if (routine !== 0) return routine;

  if (a.colStart !== b.colStart) return a.colStart - b.colStart;

  const length = b.colEnd - b.colStart - (a.colEnd - a.colStart);
  if (length !== 0) return length;

  return a.item.id.localeCompare(b.item.id);
}

/**
 * Bricks for one week row, with lanes assigned.
 *
 * A brick is clipped to this row, which is what produces week segmentation: an
 * item running Thursday to Tuesday is simply two bricks in two rows, each flagged
 * on the edge where it was cut.
 */
export function layoutWeek(items: Item[], weekStart: string): Brick[] {
  const days = weekDays(weekStart);
  const first = days[0] ?? weekStart;
  const last = days[DAYS - 1] ?? weekStart;

  const bricks: Brick[] = [];

  for (const item of items) {
    const span = itemSpan(item);
    if (span === null || span.to < first || span.from > last) continue;

    const fromIndex = span.from <= first ? 0 : days.indexOf(span.from);
    const toIndex = span.to >= last ? DAYS - 1 : days.indexOf(span.to);
    if (fromIndex < 0 || toIndex < 0) continue;

    bricks.push({
      item,
      colStart: fromIndex + 1,
      colEnd: toIndex + 2,
      lane: 0, // assigned below
      continuesLeft: span.from < first,
      continuesRight: span.to > last,
    });
  }

  const ordered = bricks.toSorted(compare);

  /*
    Lowest free lane across the *whole* span, not just the first day. That is the
    entire point of lanes: without it a bar would sit at one height on Monday and
    another on Tuesday, and a spanning brick would appear to jump mid-span.
  */
  const taken: boolean[][] = [];

  for (const brick of ordered) {
    let lane = 0;

    for (;;) {
      taken[lane] ??= Array.from({ length: DAYS }, () => false);
      const row = taken[lane] as boolean[];

      let free = true;
      for (let day = brick.colStart - 1; day < brick.colEnd - 1; day++) {
        if (row[day] === true) {
          free = false;
          break;
        }
      }

      if (free) {
        for (let day = brick.colStart - 1; day < brick.colEnd - 1; day++) row[day] = true;
        break;
      }

      lane++;
    }

    brick.lane = lane + 1;
  }

  return ordered;
}

/**
 * How many bricks each day of the row hides, keyed by day.
 *
 * A brick is drawn only if its whole lane fits (`lane <= maxLanes`) — all of it or
 * none of it, never truncated on one day and left whole on another, which is what
 * keeps a spanning bar readable. `+N more` is then drawn as a footer *inside* the
 * cell rather than occupying a lane, so it never competes with the bricks for row
 * space and each day can report its own count.
 */
export function overflow(
  bricks: Brick[],
  weekStart: string,
  maxLanes: number,
): Map<string, number> {
  const days = weekDays(weekStart);
  const hidden = new Map<string, number>();

  for (const brick of bricks) {
    if (brick.lane <= maxLanes) continue;

    for (let day = brick.colStart - 1; day < brick.colEnd - 1; day++) {
      const key = days[day];
      if (key !== undefined) hidden.set(key, (hidden.get(key) ?? 0) + 1);
    }
  }

  return hidden;
}

/** Every item touching one day, in the order a day panel should list them. */
export function itemsOn(items: Item[], day: string): Item[] {
  return items
    .filter((item) => {
      const span = itemSpan(item);
      return span !== null && span.from <= day && day <= span.to;
    })
    .toSorted((a, b) => {
      // Timed things first, in clock order; then all-day; then bare deadlines.
      const at = a.start ?? (a.allDay ? Number.MAX_SAFE_INTEGER : (a.due ?? 0));
      const bt = b.start ?? (b.allDay ? Number.MAX_SAFE_INTEGER : (b.due ?? 0));
      return at - bt || a.title.localeCompare(b.title);
    });
}

/** The month `offset` months from `month`, as 'YYYY-MM'. */
export function shiftMonth(month: string, offset: number): string {
  const [y = 0, m = 1] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** The full range a month's grid covers, for expanding occurrences into it. */
export function gridRange(month: string): Span {
  const days = monthGrid(month);
  return { from: days[0] ?? `${month}-01`, to: days[days.length - 1] ?? `${month}-01` };
}
