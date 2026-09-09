import { describe, expect, it } from 'vitest';
import { capture } from './parse';
import type { Project } from '../types';

/**
 * Turkish capture.
 *
 * Its own file because the trap it guards is specific: `chrono-node` has no
 * Turkish locale, so every date here is hand-written, and the case fold has to
 * hold for `I ı İ i` without breaking the English table running beside it.
 */

/** 2026-09-09 is a Wednesday, 12:00 local. */
const NOW = new Date(2026, 8, 9, 12, 0).getTime();

const PROJECTS = [
  { id: 'p-ev', name: 'Ev' },
  { id: 'p-is', name: 'İş' },
] as Project[];

const run = (text: string) => capture(text, PROJECTS, NOW);
const day = (ms: number | null | undefined) =>
  ms == null ? null : new Date(ms).toISOString().slice(0, 10);
const at = (ms: number | null | undefined) =>
  ms == null ? null : new Date(ms).toTimeString().slice(0, 5);

describe('the Turkish headline', () => {
  const result = run('çöpü çıkar her 2 günde bir önemli ev');

  it('keeps only the unclaimed words', () => {
    expect(result.title).toBe('çöpü çıkar');
  });

  it('reads the recurrence, importance and project', () => {
    expect(result.fields.rrule).toBe('FREQ=DAILY;INTERVAL=2');
    expect(result.fields.important).toBe(true);
    expect(result.fields.projectId).toBe('p-ev');
  });
});

describe('Turkish recurrence', () => {
  it.each([
    ['her gün', 'FREQ=DAILY'],
    ['her 3 günde bir', 'FREQ=DAILY;INTERVAL=3'],
    ['her hafta', 'FREQ=WEEKLY'],
    ['haftada bir', 'FREQ=WEEKLY'],
    ['her 2 haftada bir', 'FREQ=WEEKLY;INTERVAL=2'],
    ['her ay', 'FREQ=MONTHLY'],
    ['her Pazartesi', 'FREQ=WEEKLY;BYDAY=MO'],
    ['her Cuma', 'FREQ=WEEKLY;BYDAY=FR'],
    ['her hafta içi', 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'],
  ])('%s → %s', (phrase, rule) => {
    expect(run(`Bir şey yap ${phrase}`).fields.rrule).toBe(rule);
  });

  it('prefers "her 2 günde bir" over "her gün" inside it', () => {
    expect(run('Çöpü çıkar her 2 günde bir').title).toBe('Çöpü çıkar');
  });

  it('prefers "her hafta içi" over "her hafta"', () => {
    expect(run('Koş her hafta içi').fields.rrule).toBe('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR');
  });
});

describe('Turkish dates', () => {
  it.each([
    ['bugün', '2026-09-09'],
    ['yarın', '2026-09-10'],
    ['öbür gün', '2026-09-11'],
  ])('%s → %s', (phrase, date) => {
    expect(day(run(`Faturayı öde ${phrase}`).fields.due)).toBe(date);
  });

  it('reads a weekday as the next one, today included', () => {
    // NOW is a Wednesday, so Çarşamba is today and Cuma is two days out.
    expect(day(run('Toplantı Çarşamba').fields.due)).toBe('2026-09-09');
    expect(day(run('Toplantı Cuma').fields.due)).toBe('2026-09-11');
  });

  it('reads "önümüzdeki" as strictly the next one', () => {
    // Explicitly *next* Wednesday must skip today.
    expect(day(run('Toplantı önümüzdeki Çarşamba').fields.due)).toBe('2026-09-16');
  });

  it('reads a time', () => {
    const result = run('Toplantı saat 17:00');
    expect(at(result.fields.due)).toBe('17:00');
    expect(result.title).toBe('Toplantı');
  });

  it('reads a bare clock time', () => {
    expect(at(run('Toplantı 09:30').fields.due)).toBe('09:30');
  });

  it('does not read a number that is not a time', () => {
    expect(run('45 dakika koş').fields.due).toBeUndefined();
  });
});

describe('the case fold holds for Turkish', () => {
  it.each(['yarın', 'YARIN', 'Yarın', 'yarIn'])('matches %s', (spelling) => {
    expect(day(run(`Faturayı öde ${spelling}`).fields.due)).toBe('2026-09-10');
  });

  it('matches a project written with a dotted capital I', () => {
    // `İş` folded any other way stops matching the word on screen.
    expect(run('Raporu bitir İş').fields.projectId).toBe('p-is');
    expect(run('Raporu bitir iş').fields.projectId).toBe('p-is');
  });

  it('still matches English keywords beside it', () => {
    // The trap: `toLocaleLowerCase('tr')` turns Important into ımportant.
    expect(run('Do the thing Important').fields.important).toBe(true);
  });
});

describe('both grammars run on every line', () => {
  it('parses a sentence that switches language halfway', () => {
    const result = run('Take the bins out her 2 günde bir');

    expect(result.title).toBe('Take the bins out');
    expect(result.fields.rrule).toBe('FREQ=DAILY;INTERVAL=2');
  });

  it('mixes an English title with a Turkish date and an English flag', () => {
    const result = run('Send the invoice yarın important');

    expect(result.title).toBe('Send the invoice');
    expect(day(result.fields.due)).toBe('2026-09-10');
    expect(result.fields.important).toBe(true);
  });

  it('leaves an ordinary Turkish sentence alone', () => {
    const result = run('Annemi ara ve nasıl olduğunu sor');
    expect(result.title).toBe('Annemi ara ve nasıl olduğunu sor');
    expect(result.fields).toEqual({});
  });
});
