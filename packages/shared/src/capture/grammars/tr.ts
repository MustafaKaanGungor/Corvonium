import type { Match } from '../engine';
import type { Project } from '../../types';
import {
  addDays,
  dailyRule,
  matchPattern,
  matchPhrases,
  monthlyRule,
  nextWeekday,
  weeklyRule,
  WORKING_WEEK,
} from './shared';

/**
 * Turkish.
 *
 * `chrono-node` ships no Turkish locale — English, French, Japanese, Dutch,
 * Russian, Portuguese, Chinese and partial German and Spanish, but not Turkish —
 * so every date here is hand-written. §2.7 calls this the single largest piece of
 * effort in the feature, which is why this file covers **the forms that get typed
 * daily** rather than the whole language, and grows one case at a time.
 *
 * Everything is matched against the folded text, where `I ı İ i` have all become
 * `i` — so *yarın*, *YARIN* and *Yarın* are one entry.
 */

/** 0 is Monday, matching `buildRule`'s `byWeekday`. */
const WEEKDAYS = [
  'pazartesi',
  'salı',
  'çarşamba',
  'perşembe',
  'cuma',
  'cumartesi',
  'pazar',
] as const;

const capitalise = (word: string) => `${word[0]?.toLocaleUpperCase('tr')}${word.slice(1)}`;

function fixed(now: number): Parameters<typeof matchPhrases>[1] {
  return [
    /* ---- recurrence ---- */
    { phrase: 'her gün', kind: 'recurrence', label: 'Every day', fields: { rrule: dailyRule(1) } },
    {
      phrase: 'her hafta',
      kind: 'recurrence',
      label: 'Every week',
      fields: { rrule: weeklyRule(1) },
    },
    {
      phrase: 'haftada bir',
      kind: 'recurrence',
      label: 'Every week',
      fields: { rrule: weeklyRule(1) },
    },
    {
      phrase: 'her ay',
      kind: 'recurrence',
      label: 'Every month',
      fields: { rrule: monthlyRule(1) },
    },
    {
      phrase: 'ayda bir',
      kind: 'recurrence',
      label: 'Every month',
      fields: { rrule: monthlyRule(1) },
    },
    {
      phrase: 'her hafta içi',
      kind: 'recurrence',
      label: 'Every weekday',
      fields: { rrule: weeklyRule(1, WORKING_WEEK) },
    },

    ...WEEKDAYS.map((day, index) => ({
      phrase: `her ${day}`,
      kind: 'recurrence' as const,
      label: `Every ${capitalise(day)}`,
      fields: { rrule: weeklyRule(1, [index]) },
    })),

    /* ---- relative days ---- */
    { phrase: 'bugün', kind: 'date', label: 'Bugün', fields: { due: addDays(now, 0) } },
    { phrase: 'yarın', kind: 'date', label: 'Yarın', fields: { due: addDays(now, 1) } },
    { phrase: 'öbür gün', kind: 'date', label: 'Öbür gün', fields: { due: addDays(now, 2) } },
    { phrase: 'ertesi gün', kind: 'date', label: 'Ertesi gün', fields: { due: addDays(now, 1) } },

    /* ---- weekdays, plain and "next" ---- */
    ...WEEKDAYS.flatMap((day, index) =>
      ['önümüzdeki', 'gelecek', 'haftaya'].map((prefix) => ({
        phrase: `${prefix} ${day}`,
        kind: 'date' as const,
        label: `${capitalise(prefix)} ${capitalise(day)}`,
        // Explicitly *next*, so today never satisfies it.
        fields: { due: nextWeekday(now, index, false) },
      })),
    ),
    ...WEEKDAYS.map((day, index) => ({
      phrase: day,
      kind: 'date' as const,
      label: capitalise(day),
      fields: { due: nextWeekday(now, index) },
    })),

    /* ---- importance ---- */
    { phrase: 'önemli', kind: 'importance', label: 'Important', fields: { important: true } },
    { phrase: 'acil', kind: 'importance', label: 'Important', fields: { important: true } },
  ];
}

/** `her 2 günde bir`, and its week and month twins. */
function intervals(folded: string): Match[] {
  return [
    ...matchPattern(folded, /her (\d+) günde bir/u, (hit) => {
      const n = Number(hit[1]);
      return n < 2
        ? null
        : { kind: 'recurrence', label: `Every ${n} days`, fields: { rrule: dailyRule(n) } };
    }),
    ...matchPattern(folded, /her (\d+) haftada bir/u, (hit) => {
      const n = Number(hit[1]);
      return n < 2
        ? null
        : { kind: 'recurrence', label: `Every ${n} weeks`, fields: { rrule: weeklyRule(n) } };
    }),
    ...matchPattern(folded, /her (\d+) ayda bir/u, (hit) => {
      const n = Number(hit[1]);
      return n < 2
        ? null
        : { kind: 'recurrence', label: `Every ${n} months`, fields: { rrule: monthlyRule(n) } };
    }),
  ];
}

/**
 * `saat 17:00`, or a bare `17:00`.
 *
 * The hour lands on **today** unless a date match also applies, in which case
 * `compose` merges them and the later field wins — which is why the time carries
 * only an hour and minute rather than a whole instant of its own.
 */
function times(folded: string, now: number): Match[] {
  return matchPattern(
    folded,
    /(?:saat )?([01]?\d|2[0-3])[:.]([0-5]\d)(?:'de|'da|'te|'ta)?/u,
    (hit) => {
      const hours = Number(hit[1]);
      const minutes = Number(hit[2]);

      const d = new Date(now);
      const at = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hours, minutes, 0, 0);

      return {
        kind: 'time',
        label: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`,
        fields: { due: at.getTime() },
      };
    },
  );
}

export function matchTurkish(folded: string, _projects: Project[], now: number): Match[] {
  return [...matchPhrases(folded, fixed(now)), ...intervals(folded), ...times(folded, now)];
}
