import type { ItemEdit } from '../transitions';

/**
 * Quick capture, the language-agnostic half — §2.7.
 *
 * Matching, span tracking and title stripping live here; what counts as a match
 * lives in the per-language grammars. Adding a third language is then a new file
 * rather than a change to any of this.
 */

export type MatchKind = 'recurrence' | 'importance' | 'project' | 'date' | 'time' | 'block';

export type Match = {
  /**
   * Stable across keystrokes, so a chip you tapped off stays off while you keep
   * typing. Derived from what was matched rather than from where it sat, because
   * every span shifts the moment a character is inserted before it.
   */
  id: string;
  kind: MatchKind;
  /** Character offsets into the *original* text, for marking it in place. */
  start: number;
  end: number;
  /** What the chip says — 'Every 2 days', 'Important', a project name. */
  label: string;
  fields: ItemEdit;
};

/** Letters and digits in any script, so Turkish words count as words. */
const WORD = /[\p{L}\p{N}]/u;

/**
 * The one case fold, applied to **both** the input and every keyword table.
 *
 * `"I".toLowerCase()` is `"i"`, but Turkish folds `I` to `ı` and `İ` to `i`. A
 * `toLocaleLowerCase('tr')` would break every English keyword — *Important*
 * becomes *ımportant* — and a plain `toLowerCase()` breaks *İş*. Neither works
 * for a line containing both languages, which is exactly what §2.7 asks for.
 *
 * So all four of `I ı İ i` collapse to `i` first. That loses the ı/i distinction,
 * which for a small closed keyword set is a fair trade and is why *yarın*,
 * *YARIN* and *Yarın* all match one entry.
 *
 * **Length is preserved**, deliberately: every offset here indexes back into the
 * original text to mark it, so a fold that grew or shrank would misplace the
 * marking. `İ` is replaced before lowercasing precisely because
 * `'İ'.toLowerCase()` is two code units.
 */
export function fold(text: string): string {
  return text.replaceAll(/[İIı]/gu, 'i').toLowerCase();
}

/** Whether `[start, end)` sits on word boundaries rather than inside a word. */
export function isWholeWord(text: string, start: number, end: number): boolean {
  const before = start === 0 ? '' : text[start - 1];
  const after = end >= text.length ? '' : text[end];

  return (
    (before === undefined || before === '' || !WORD.test(before)) &&
    (after === undefined || after === '' || !WORD.test(after))
  );
}

/**
 * Every whole-word occurrence of a folded phrase.
 *
 * Whole words only — rule 1 of §2.7 — so *homework* never matches the Home
 * project and *importantly* is not *important*.
 */
export function findPhrase(folded: string, phrase: string): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  if (phrase === '') return out;

  let from = 0;

  for (;;) {
    const start = folded.indexOf(phrase, from);
    if (start < 0) return out;

    const end = start + phrase.length;
    if (isWholeWord(folded, start, end)) out.push({ start, end });

    from = start + 1;
  }
}

/**
 * Drop overlapping candidates, longest first — rule 2 of §2.7.
 *
 * *every 2 days* beats *every*, and a recurrence beats the bare weekday inside
 * it, without either grammar needing to know the other exists.
 */
export function resolve(matches: Match[]): Match[] {
  const byLength = matches.toSorted(
    (a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start,
  );

  const kept: Match[] = [];

  for (const match of byLength) {
    const clashes = kept.some((other) => match.start < other.end && other.start < match.end);
    if (!clashes) kept.push(match);
  }

  return kept.toSorted((a, b) => a.start - b.start);
}

export type Composed = {
  title: string;
  fields: ItemEdit;
  /** The matches that actually applied — what the UI marks and shows as chips. */
  used: Match[];
};

/**
 * The text minus its matches, and the fields they carry.
 *
 * Rule 3 of §2.7: **never strip the whole title.** If the matches would consume
 * everything — someone typing just `important` — all of them are dropped and the
 * text stands as written. Dropping every match rather than guessing which to keep
 * is the predictable answer, and it keeps the chips honest: they show exactly
 * what was applied, so an empty result shows none.
 */
export function compose(text: string, matches: Match[]): Composed {
  const ordered = resolve(matches);

  let title = '';
  let cursor = 0;

  for (const match of ordered) {
    title += text.slice(cursor, match.start);
    cursor = match.end;
  }

  title = `${title}${text.slice(cursor)}`.replaceAll(/\s+/gu, ' ').trim();

  if (title === '') return { title: text.trim(), fields: {}, used: [] };

  const fields: ItemEdit = {};
  for (const match of ordered) Object.assign(fields, match.fields);

  return { title, fields, used: ordered };
}
