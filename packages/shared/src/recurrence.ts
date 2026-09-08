import { RRule, rrulestr } from 'rrule';
import { endOfLocalDay, localDate } from './derive';
import type { Item } from './types';

/**
 * Recurrence — §2.4.
 *
 * Occurrences are expanded at render time and **never stored as rows**. Only the
 * occurrences you actually touch cost a document, as an override carrying
 * `seriesId` + `originalStart`.
 *
 * ## How far back missed occurrences go
 *
 * Every skipped occurrence becomes its own missed row, as chosen — but bounded.
 * A daily routine untouched for three years would otherwise yield a thousand rows
 * recomputed on every render, and a habit dropped two months ago is a decision you
 * already made rather than an outstanding to-do.
 */
export const MISSED_HORIZON_DAYS = 60;

/**
 * Which occurrences an edit or a cancellation applies to — §2.4.
 *
 * The prompt appears every time, with no "don't ask again": the three outcomes are
 * far enough apart that guessing wrong is worse than one extra tap.
 */
export type SeriesScope = 'one' | 'future' | 'all';

/* -------------------------------------------------------------------------- */
/* local-time discipline                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The whole reason this file does not have DST bugs.
 *
 * `rrule` computes in UTC. Handing it real instants means a rule anchored at 09:00
 * local drifts an hour when the clocks change, which is the failure the library is
 * most known for. So the rule is expanded over **dates only**: the anchor's local
 * calendar date is handed over as UTC midnight, results come back as UTC midnights,
 * and each is read back as a local calendar date. Time of day never enters the
 * calculation — it is re-attached afterwards by shifting whole calendar days.
 */
function toUtcNaive(ms: number): Date {
  const d = new Date(ms);
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

/** A UTC-naive date back to the same calendar day at local midnight. */
function fromUtcNaive(d: Date): number {
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()).getTime();
}

/**
 * Move an instant by whole calendar days, keeping its local wall-clock time.
 *
 * Adding `days * 86_400_000` would land an hour out across a clock change; going
 * through the local date fields keeps 09:00 at 09:00 on both sides.
 */
function shiftDays(ms: number, days: number): number {
  const d = new Date(ms);
  return new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate() + days,
    d.getHours(),
    d.getMinutes(),
    d.getSeconds(),
    d.getMilliseconds(),
  ).getTime();
}

/** Whole calendar days from `a` to `b`, ignoring the time of day on both. */
function daysBetween(a: number, b: number): number {
  const from = toUtcNaive(a).getTime();
  const to = toUtcNaive(b).getTime();
  return Math.round((to - from) / 86_400_000);
}

/** Shift a 'YYYY-MM-DD' string by whole days, or `null` through. */
function shiftDateString(date: string | null, days: number): string | null {
  if (date === null) return null;
  const parts = date.split('-').map(Number);
  const [y, m, d] = parts;
  if (y === undefined || m === undefined || d === undefined) return null;
  return localDate(new Date(y, m - 1, d + days).getTime());
}

/* -------------------------------------------------------------------------- */
/* the rule itself                                                             */
/* -------------------------------------------------------------------------- */

export type RuleFreq = 'daily' | 'weekly' | 'monthly';

/** The §2.4 preset table, as data. `byWeekday` is 0=Monday … 6=Sunday. */
export type RulePart = {
  freq: RuleFreq;
  interval: number;
  byWeekday: number[];
};

const WEEKDAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];
const WEEKDAY_CODES = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

export function buildRule(part: RulePart): string {
  const bits = [`FREQ=${part.freq.toUpperCase()}`];

  // INTERVAL=1 is the default; writing it makes every rule noisier to read.
  if (part.interval > 1) bits.push(`INTERVAL=${part.interval}`);

  if (part.freq === 'weekly' && part.byWeekday.length > 0) {
    const days = part.byWeekday.toSorted((a, b) => a - b).map((d) => WEEKDAY_CODES[d]);
    bits.push(`BYDAY=${days.join(',')}`);
  }

  return bits.join(';');
}

/**
 * An RRULE back to the preset shape, or `null` if it is something the presets
 * cannot express — which is what puts the editor into its Custom mode rather than
 * silently showing the wrong preset.
 *
 * `UNTIL` is deliberately ignored: it is an end date the "this and all future"
 * flow writes, not part of the pattern the user picked.
 */
export function parseRule(rrule: string): RulePart | null {
  let options;
  try {
    options = RRule.parseString(rrule);
  } catch {
    return null;
  }

  const freq =
    options.freq === RRule.DAILY
      ? 'daily'
      : options.freq === RRule.WEEKLY
        ? 'weekly'
        : options.freq === RRule.MONTHLY
          ? 'monthly'
          : null;

  if (freq === null) return null;

  // Anything the presets have no control for has to fall through to Custom.
  if (options.bymonthday !== undefined || options.bysetpos !== undefined) return null;
  if (freq !== 'weekly' && options.byweekday !== undefined) return null;

  // `BYDAY=MO` parses to a bare value rather than a one-element array, and each
  // entry is either a day number or a `Weekday` object depending on the input.
  const raw = options.byweekday ?? [];
  const byWeekday = (Array.isArray(raw) ? raw : [raw]).map((d) =>
    typeof d === 'number' ? d : (d as { weekday: number }).weekday,
  );

  return { freq, interval: options.interval ?? 1, byWeekday };
}

/** Human wording for a rule. Falls back to the raw string it cannot read. */
export function describeRule(rrule: string): string {
  const part = parseRule(rrule);
  if (part === null) return rrule;

  const every = part.interval === 1 ? 'Every' : `Every ${part.interval}`;

  if (part.freq === 'daily') return part.interval === 1 ? 'Every day' : `${every} days`;
  if (part.freq === 'monthly') return part.interval === 1 ? 'Every month' : `${every} months`;

  if (part.byWeekday.length === 0) {
    return part.interval === 1 ? 'Every week' : `${every} weeks`;
  }

  const names = part.byWeekday.toSorted((a, b) => a - b).map((d) => WEEKDAY_NAMES[d]);
  const list =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

  return part.interval === 1 ? `Every ${list}` : `${every} weeks on ${list}`;
}

/**
 * The rule with `UNTIL` set to the end of the day *before* `before` — "this and
 * all future", which must leave history untouched.
 *
 * `UNTIL` is written in the same UTC-naive frame the expansion uses, so it lines
 * up with the dates coming out of it rather than being a day off near midnight.
 */
export function endSeriesBefore(rrule: string, before: number): string {
  const withoutUntil = rrule
    .split(';')
    .filter((bit) => !bit.toUpperCase().startsWith('UNTIL='))
    .join(';');

  return `${withoutUntil};UNTIL=${endStamp(shiftDays(before, -1))}`;
}

/* -------------------------------------------------------------------------- */
/* occurrences                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The instant a series counts from: its start, else its deadline, else the first
 * day of an all-day span. `null` when there is no date at all, which
 * `recurrenceError` refuses to save.
 */
export function anchorOf(item: Item): number | null {
  if (item.start !== null) return item.start;
  if (item.due !== null) return item.due;
  if (item.startDate !== null) return endOfLocalDay(item.startDate);
  return null;
}

/**
 * One occurrence of a series, as an in-memory `Item`.
 *
 * Every date moves by the same whole-day delta, so a two-day all-day event that
 * repeats weekly stays two days long. `rrule` is carried forward so `isRoutine`
 * still holds and occurrences group under Routine rather than scattering into the
 * quadrants; `seriesId` and `originalStart` are what make it addressable.
 *
 * The id is derived, not random: it has to be stable across renders for React
 * keys and dnd-kit ids, and it has to be reproducible to find an override.
 */
export function occurrenceAt(series: Item, originalStart: number): Item {
  const anchor = anchorOf(series);
  const delta = anchor === null ? 0 : daysBetween(anchor, originalStart);

  return {
    ...series,
    id: `${series.id}:${originalStart}`,
    seriesId: series.id,
    originalStart,
    start: series.start === null ? null : shiftDays(series.start, delta),
    end: series.end === null ? null : shiftDays(series.end, delta),
    due: series.due === null ? null : shiftDays(series.due, delta),
    startDate: shiftDateString(series.startDate, delta),
    endDate: shiftDateString(series.endDate, delta),
    // An occurrence is never itself completed — only its override is, and that
    // replaces this object wholesale.
    status: 'open',
    completedAt: null,
    cancelledAt: null,
  };
}

/** Key an override by the occurrence it stands for. */
function overrideKey(seriesId: string, originalStart: number): string {
  return `${seriesId}:${originalStart}`;
}

/**
 * Every occurrence of one series between two instants, with overrides merged in.
 *
 * Where an override exists it **is** the occurrence — that is how a completed
 * Tuesday stays completed and a cancelled one stays gone.
 */
/** `20260908` — the UTC-naive calendar date, which is all the rule frame carries. */
function dateStamp(ms: number): string {
  return toUtcNaive(ms).toISOString().slice(0, 10).replaceAll('-', '');
}

/** `20260908T000000Z` — where a rule starts. */
function stamp(ms: number): string {
  return `${dateStamp(ms)}T000000Z`;
}

/**
 * `20260907T235959Z` — where a rule stops.
 *
 * Midnight would work identically in this date-only frame, but naming the end of
 * the day is what every other calendar writes, and these rules are RFC 5545 that
 * may one day leave the app.
 */
function endStamp(ms: number): string {
  return `${dateStamp(ms)}T235959Z`;
}

/** The parsed rule for a series, or `null` if it cannot be expanded at all. */
function ruleFor(series: Item): RRule | null {
  if (series.rrule === null || series.status !== 'open') return null;

  const anchor = anchorOf(series);
  if (anchor === null) return null;

  try {
    const parsed = rrulestr(`DTSTART:${stamp(anchor)}\nRRULE:${series.rrule}`);
    return parsed instanceof RRule ? parsed : null;
  } catch {
    return null;
  }
}

/** An override for this occurrence, or the virtual occurrence itself. */
function resolve(series: Item, overrides: Item[], originalStart: number): Item {
  const key = overrideKey(series.id, originalStart);
  const override = overrides.find(
    (o) => o.seriesId === series.id && overrideKey(series.id, o.originalStart ?? 0) === key,
  );
  return override ?? occurrenceAt(series, originalStart);
}

/** A UTC-naive date from the rule back to this series' own anchor instant. */
function anchoredAt(anchor: number, date: Date): number {
  return shiftDays(anchor, daysBetween(anchor, fromUtcNaive(date)));
}

export function expandSeries(series: Item, overrides: Item[], from: number, to: number): Item[] {
  const rule = ruleFor(series);
  const anchor = anchorOf(series);
  if (rule === null || anchor === null) return [];

  // `between` is inclusive at both ends; the window is widened by a day on each
  // side so an occurrence late on a boundary day is not lost to the time of day.
  const dates = rule.between(toUtcNaive(shiftDays(from, -1)), toUtcNaive(shiftDays(to, 1)), true);

  const out: Item[] = [];

  for (const date of dates) {
    const occurrence = resolve(series, overrides, anchoredAt(anchor, date));

    const at = anchorOf(occurrence);
    if (at !== null && (at < from || at > to)) continue;

    out.push(occurrence);
  }

  return out;
}

/**
 * The first occurrence strictly after `after`, or `null` if the series has ended.
 *
 * Separate from `expandSeries` because `rrule`'s `after()` walks to one result,
 * where asking `between()` for a year and taking the head would expand 365 dates
 * to render a single row.
 */
export function nextOccurrence(series: Item, overrides: Item[], after: number): Item | null {
  const rule = ruleFor(series);
  const anchor = anchorOf(series);
  if (rule === null || anchor === null) return null;

  const date = rule.after(toUtcNaive(after), false);
  return date === null ? null : resolve(series, overrides, anchoredAt(anchor, date));
}

/**
 * The list every list-shaped screen renders: standalone items, plus the
 * occurrences of every series.
 *
 * Backwards it reaches `MISSED_HORIZON_DAYS`, so every skipped occurrence inside
 * that window is its own missed row. Forwards it stops at the end of today **plus
 * one** occurrence per series, so a Monday-only routine is still findable and
 * editable on a Wednesday. The Calendar will want a wider window, which is what
 * `expandSeries` takes a range for.
 *
 * The series document itself is never emitted. Its dates are the anchor for a
 * rule, not a commitment — rendering it would put an item on screen dated whenever
 * you first created it, looking permanently missed.
 */
export function expandAll(items: Item[], now: number): Item[] {
  const overrides = items.filter((item) => item.seriesId !== null);
  const out: Item[] = [];

  for (const item of items) {
    if (item.seriesId !== null) continue; // an override reaches the list through its series
    if (item.rrule === null) {
      out.push(item);
      continue;
    }

    const from = shiftDays(now, -MISSED_HORIZON_DAYS);
    const todayEnd = endOfLocalDay(localDate(now)) ?? now;

    out.push(...expandSeries(item, overrides, from, todayEnd));

    // Exactly one occurrence ahead, so the rule stays reachable on a day it does
    // not fall on — a Monday routine has to be editable on a Wednesday.
    const ahead = nextOccurrence(item, overrides, todayEnd);
    if (ahead !== null) out.push(ahead);
  }

  return out;
}

/**
 * Every item that could appear in a window, occurrences expanded to fill it.
 *
 * `expandAll` is pinned to the missed horizon and one occurrence ahead, which is
 * right for a list of what needs doing and wrong for a month you are looking at:
 * September needs September's occurrences whether or not they are near today.
 * Standalone items pass through untouched and the caller filters them by date.
 */
export function expandRange(items: Item[], from: number, to: number): Item[] {
  const overrides = items.filter((item) => item.seriesId !== null);
  const out: Item[] = [];

  for (const item of items) {
    if (item.seriesId !== null) continue; // an override reaches the window through its series
    if (item.rrule === null) out.push(item);
    else out.push(...expandSeries(item, overrides, from, to));
  }

  return out;
}
