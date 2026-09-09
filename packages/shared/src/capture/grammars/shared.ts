import { buildRule } from '../../recurrence';
import { endOfLocalDay, localDate } from '../../derive';
import { fold, findPhrase, isWholeWord, type Match, type MatchKind } from '../engine';
import type { Project } from '../../types';

/**
 * Pieces both grammars need. Language-specific words stay in `en.ts` and `tr.ts`;
 * what a recurrence *is* does not differ between them.
 */

/** BYDAY codes in the order `buildRule` expects — 0 is Monday. */
export const WEEKDAY_CODES = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

export function dailyRule(interval: number): string {
  return buildRule({ freq: 'daily', interval, byWeekday: [] });
}

export function weeklyRule(interval: number, byWeekday: number[] = []): string {
  return buildRule({ freq: 'weekly', interval, byWeekday });
}

export function monthlyRule(interval: number): string {
  return buildRule({ freq: 'monthly', interval, byWeekday: [] });
}

/** Weekdays, for "every weekday" and its Turkish twin. */
export const WORKING_WEEK = [0, 1, 2, 3, 4];

/** A deadline at the end of a day — the shape a bare date takes. */
export function dueEndOfDay(ms: number): number {
  return endOfLocalDay(localDate(ms)) ?? ms;
}

/** The next occurrence of a weekday, at or after `now`. 0 is Monday. */
export function nextWeekday(now: number, weekday: number, inclusive = true): number {
  const d = new Date(now);
  const today = (d.getDay() + 6) % 7;

  let ahead = (weekday - today + 7) % 7;
  if (ahead === 0 && !inclusive) ahead = 7;

  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + ahead, 23, 59, 0, 0).getTime();
}

/** Shift by whole calendar days, keeping the wall-clock time. */
export function addDays(ms: number, days: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, 23, 59, 0, 0).getTime();
}

type PhraseRule = {
  /** Written unfolded for readability; folded before matching. */
  phrase: string;
  kind: MatchKind;
  label: string;
  fields: Match['fields'];
};

/** Every whole-word hit for a table of fixed phrases. */
export function matchPhrases(folded: string, rules: PhraseRule[]): Match[] {
  const out: Match[] = [];

  for (const rule of rules) {
    for (const at of findPhrase(folded, fold(rule.phrase))) {
      out.push({
        id: `${rule.kind}:${fold(rule.phrase)}`,
        kind: rule.kind,
        start: at.start,
        end: at.end,
        label: rule.label,
        fields: rule.fields,
      });
    }
  }

  return out;
}

/**
 * Every whole-word hit for a regular expression.
 *
 * Used where a number is part of the phrase — *every 2 days*, *her 2 günde bir* —
 * which a fixed table cannot express. The boundary check is applied here too, so
 * a pattern cannot claim the inside of a word.
 */
export function matchPattern(
  folded: string,
  pattern: RegExp,
  build: (groups: RegExpExecArray) => Omit<Match, 'id' | 'start' | 'end'> | null,
): Match[] {
  const out: Match[] = [];
  const re = new RegExp(
    pattern.source,
    pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`,
  );

  for (const hit of folded.matchAll(re)) {
    const start = hit.index;
    const end = start + hit[0].length;
    if (!isWholeWord(folded, start, end)) continue;

    const built = build(hit as RegExpExecArray);
    if (built === null) continue;

    out.push({ ...built, id: `${built.kind}:${hit[0]}`, start, end });
  }

  return out;
}

/**
 * Projects, by name or `#name`.
 *
 * Longest first so a project called "Home Admin" wins over one called "Home" —
 * `resolve` would settle it anyway, but sorting here keeps the ids deterministic.
 */
export function matchProjects(folded: string, projects: Project[]): Match[] {
  const out: Match[] = [];

  for (const project of projects.toSorted((a, b) => b.name.length - a.name.length)) {
    const name = fold(project.name);
    if (name === '') continue;

    for (const at of [...findPhrase(folded, name), ...findPhrase(folded, `#${name}`)]) {
      out.push({
        id: `project:${project.id}`,
        kind: 'project',
        start: at.start,
        end: at.end,
        label: project.name,
        fields: { projectId: project.id },
      });
    }
  }

  return out;
}
