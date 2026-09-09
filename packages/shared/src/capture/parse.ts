import { compose, fold, resolve, type Composed, type Match } from './engine';
import { matchEnglish } from './grammars/en';
import { matchTurkish } from './grammars/tr';
import type { Project } from '../types';

export * from './engine';

/**
 * One line of text to the fields of an item — §2.7.
 *
 * **Every grammar runs on every input** and the matches are merged, rather than a
 * "capture language" setting choosing one. English and Turkish keywords barely
 * collide, so it costs nothing, and it is what makes *"Take the bins out her 2
 * günde bir"* parse — which is how bilingual people actually type.
 *
 * Pure: no database, no clock beyond the `now` handed in. That is what makes this
 * the most testable code in the app, and why the grammars return candidates
 * rather than deciding anything — `resolve` settles overlaps in one place.
 */
export function parse(text: string, projects: Project[], now: number): Match[] {
  const folded = fold(text);

  return resolve([
    ...matchEnglish(text, folded, projects, now),
    ...matchTurkish(folded, projects, now),
  ]);
}

/**
 * Parse and apply in one go, minus any chips that have been tapped off.
 *
 * Dismissal is by `Match.id`, which is derived from *what* matched rather than
 * where — so a chip stays off while you keep typing in front of it.
 */
export function capture(
  text: string,
  projects: Project[],
  now: number,
  dismissed: ReadonlySet<string> = new Set(),
): Composed {
  const matches = parse(text, projects, now).filter((match) => !dismissed.has(match.id));
  return compose(text, matches);
}
