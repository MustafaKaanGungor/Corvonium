import * as chrono from 'chrono-node';
import type { Match } from '../engine';
import type { Project } from '../../types';
import {
  dailyRule,
  dueEndOfDay,
  matchPattern,
  matchPhrases,
  matchProjects,
  monthlyRule,
  weeklyRule,
  WEEKDAY_CODES,
  WORKING_WEEK,
} from './shared';

/** English. Dates and times come from `chrono-node`; the rest is a keyword table. */

const WEEKDAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

const PHRASES: Parameters<typeof matchPhrases>[1] = [
  { phrase: 'every day', kind: 'recurrence', label: 'Every day', fields: { rrule: dailyRule(1) } },
  { phrase: 'everyday', kind: 'recurrence', label: 'Every day', fields: { rrule: dailyRule(1) } },
  { phrase: 'daily', kind: 'recurrence', label: 'Every day', fields: { rrule: dailyRule(1) } },

  {
    phrase: 'every week',
    kind: 'recurrence',
    label: 'Every week',
    fields: { rrule: weeklyRule(1) },
  },
  { phrase: 'weekly', kind: 'recurrence', label: 'Every week', fields: { rrule: weeklyRule(1) } },

  {
    phrase: 'every month',
    kind: 'recurrence',
    label: 'Every month',
    fields: { rrule: monthlyRule(1) },
  },
  {
    phrase: 'monthly',
    kind: 'recurrence',
    label: 'Every month',
    fields: { rrule: monthlyRule(1) },
  },

  {
    phrase: 'every weekday',
    kind: 'recurrence',
    label: 'Every weekday',
    fields: { rrule: weeklyRule(1, WORKING_WEEK) },
  },

  ...WEEKDAYS.map((day, index) => ({
    phrase: `every ${day}`,
    kind: 'recurrence' as const,
    label: `Every ${day[0]?.toUpperCase()}${day.slice(1)}`,
    fields: { rrule: weeklyRule(1, [index]) },
  })),

  { phrase: 'important', kind: 'importance', label: 'Important', fields: { important: true } },
];

/** `every 2 days` and its week/month twins — a number a fixed table cannot hold. */
function intervals(folded: string): Match[] {
  return [
    ...matchPattern(folded, /every (\d+) days?/u, (hit) => {
      const n = Number(hit[1]);
      return n < 2
        ? null
        : { kind: 'recurrence', label: `Every ${n} days`, fields: { rrule: dailyRule(n) } };
    }),
    ...matchPattern(folded, /every (\d+) weeks?/u, (hit) => {
      const n = Number(hit[1]);
      return n < 2
        ? null
        : { kind: 'recurrence', label: `Every ${n} weeks`, fields: { rrule: weeklyRule(n) } };
    }),
    ...matchPattern(folded, /every (\d+) months?/u, (hit) => {
      const n = Number(hit[1]);
      return n < 2
        ? null
        : { kind: 'recurrence', label: `Every ${n} months`, fields: { rrule: monthlyRule(n) } };
    }),
  ];
}

/**
 * `!` as importance.
 *
 * Not whole-word matched: it is punctuation, so it usually sits flush against the
 * word before it and the boundary rule would reject every real use of it.
 */
function bang(text: string): Match[] {
  const out: Match[] = [];

  for (let i = text.indexOf('!'); i >= 0; i = text.indexOf('!', i + 1)) {
    out.push({
      id: 'importance:!',
      kind: 'importance',
      start: i,
      end: i + 1,
      label: 'Important',
      fields: { important: true },
    });
  }

  return out;
}

/**
 * Dates, times and ranges.
 *
 * `chrono` reads the **original** text, not the folded copy, so its offsets index
 * straight back into what was typed — and its own casing rules stay intact.
 */
function dates(text: string, now: number): Match[] {
  return chrono.parse(text, new Date(now)).map((result) => {
    const from = result.start.date().getTime();
    const label = result.text[0]?.toUpperCase() + result.text.slice(1);

    // `chrono` reports an open-ended result as `null`, not `undefined` — checking
    // for the wrong one dereferences it.
    const until = result.end ?? null;

    // A range is a block; a bare date is a deadline at the end of that day, since
    // "on Friday" is not due at midnight.
    const fields =
      until !== null
        ? { start: from, end: until.date().getTime(), allDay: false }
        : result.start.isCertain('hour')
          ? { due: from }
          : { due: dueEndOfDay(from) };

    return {
      id: `date:${result.text.toLowerCase()}`,
      kind: until !== null ? ('block' as const) : ('date' as const),
      start: result.index,
      end: result.index + result.text.length,
      label,
      fields,
    };
  });
}

export function matchEnglish(
  text: string,
  folded: string,
  projects: Project[],
  now: number,
): Match[] {
  return [
    ...matchPhrases(folded, PHRASES),
    ...intervals(folded),
    ...bang(text),
    ...dates(text, now),
    ...matchProjects(folded, projects),
  ];
}

export { WEEKDAY_CODES };
