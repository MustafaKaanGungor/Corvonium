import { describe, expect, it } from 'vitest';
import { capture, fold, parse } from './parse';
import type { Project } from '../types';

/** 2026-09-09 is a Wednesday, 12:00 local. */
const NOW = new Date(2026, 8, 9, 12, 0).getTime();

const PROJECTS = [
  { id: 'p-home', name: 'Home' },
  { id: 'p-corv', name: 'Corvonium' },
  { id: 'p-admin', name: 'Home Admin' },
] as Project[];

const run = (text: string, projects: Project[] = PROJECTS) => capture(text, projects, NOW);
const day = (ms: number | null | undefined) =>
  ms == null ? null : new Date(ms).toISOString().slice(0, 10);
const at = (ms: number | null | undefined) =>
  ms == null ? null : new Date(ms).toTimeString().slice(0, 5);

/* -------------------------------------------------------------------------- */
/* the headline                                                                */
/* -------------------------------------------------------------------------- */

describe('the sentence the feature exists for', () => {
  const result = run('Take the garbage out every 2 days important home');

  it('keeps only the words it did not use as the title', () => {
    expect(result.title).toBe('Take the garbage out');
  });

  it('reads the recurrence as RFC 5545', () => {
    expect(result.fields.rrule).toBe('FREQ=DAILY;INTERVAL=2');
  });

  it('reads importance and the project', () => {
    expect(result.fields.important).toBe(true);
    expect(result.fields.projectId).toBe('p-home');
  });

  it('marks one chip per value', () => {
    expect(result.used.map((m) => m.label)).toEqual(['Every 2 days', 'Important', 'Home']);
  });
});

/* -------------------------------------------------------------------------- */
/* the three rules of §2.7                                                     */
/* -------------------------------------------------------------------------- */

describe('whole words only', () => {
  it('does not file "homework" under Home', () => {
    const result = run('Buy homework supplies');
    expect(result.title).toBe('Buy homework supplies');
    expect(result.fields.projectId).toBeUndefined();
  });

  it('does not read "importantly" as important', () => {
    expect(run('Speak importantly').fields.important).toBeUndefined();
  });

  it('does not find "her" inside "there"', () => {
    // The Turkish recurrence marker is a common English substring.
    expect(run('Put it there every day').title).toBe('Put it there');
  });
});

describe('longest match wins', () => {
  it('prefers "every 2 days" over "every"', () => {
    expect(run('Water plants every 2 days').fields.rrule).toBe('FREQ=DAILY;INTERVAL=2');
  });

  it('prefers "every Monday" over the bare weekday', () => {
    const result = run('Gym every Monday');
    expect(result.fields.rrule).toBe('FREQ=WEEKLY;BYDAY=MO');
    expect(result.used).toHaveLength(1);
  });

  it('prefers a longer project name over one contained in it', () => {
    expect(run('Sort the shed Home Admin').fields.projectId).toBe('p-admin');
  });

  it('leaves no stray span behind the loser', () => {
    // The whole phrase is consumed, so nothing of it survives in the title.
    expect(run('Gym every Monday').title).toBe('Gym');
  });
});

describe('never strip the whole title', () => {
  it('keeps a line that is nothing but modifiers', () => {
    const result = run('important');
    expect(result.title).toBe('important');
    expect(result.fields.important).toBeUndefined();
    expect(result.used).toEqual([]);
  });

  it('keeps a line of two modifiers rather than inventing a title', () => {
    expect(run('important home').title).toBe('important home');
  });

  it('applies matches as soon as one real word survives', () => {
    expect(run('Rent important').title).toBe('Rent');
    expect(run('Rent important').fields.important).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* English                                                                     */
/* -------------------------------------------------------------------------- */

describe('English recurrence', () => {
  it.each([
    ['every day', 'FREQ=DAILY'],
    ['daily', 'FREQ=DAILY'],
    ['every 3 days', 'FREQ=DAILY;INTERVAL=3'],
    ['weekly', 'FREQ=WEEKLY'],
    ['every 2 weeks', 'FREQ=WEEKLY;INTERVAL=2'],
    ['monthly', 'FREQ=MONTHLY'],
    ['every Friday', 'FREQ=WEEKLY;BYDAY=FR'],
    ['every weekday', 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'],
  ])('%s → %s', (phrase, rule) => {
    expect(run(`Do the thing ${phrase}`).fields.rrule).toBe(rule);
  });

  it('ignores an interval of one, which is just the plain rule', () => {
    expect(run('Do it every 1 days').fields.rrule).toBeUndefined();
  });
});

describe('English importance', () => {
  it('reads the word', () => {
    expect(run('Call the bank important').fields.important).toBe(true);
  });

  it('reads a bang flush against the word before it', () => {
    // Punctuation never sits on a word boundary, so `!` is matched separately.
    const result = run('Call the bank!');
    expect(result.fields.important).toBe(true);
    expect(result.title).toBe('Call the bank');
  });
});

describe('English dates and times', () => {
  it('reads tomorrow as a deadline at the end of that day', () => {
    const result = run('Renew the domain tomorrow');
    expect(result.title).toBe('Renew the domain');
    expect(day(result.fields.due)).toBe('2026-09-10');
    expect(at(result.fields.due)).toBe('23:59');
  });

  it('keeps a stated time rather than pushing it to end of day', () => {
    const result = run('Standup tomorrow at 9am');
    expect(day(result.fields.due)).toBe('2026-09-10');
    expect(at(result.fields.due)).toBe('09:00');
  });

  it('reads a range as a block, not a deadline', () => {
    const result = run('Workshop tomorrow from 2pm to 4pm');
    expect(at(result.fields.start)).toBe('14:00');
    expect(at(result.fields.end)).toBe('16:00');
    expect(result.fields.due).toBeUndefined();
  });

  it('reads "in 3 days"', () => {
    expect(day(run('Chase the invoice in 3 days').fields.due)).toBe('2026-09-12');
  });
});

describe('projects', () => {
  it('matches a bare name', () => {
    expect(run('Fix the sink Home').fields.projectId).toBe('p-home');
  });

  it('matches a hashtag', () => {
    const result = run('Write the sync spec #Corvonium');
    expect(result.fields.projectId).toBe('p-corv');
    expect(result.title).toBe('Write the sync spec');
  });

  it('matches regardless of case', () => {
    expect(run('Fix the sink HOME').fields.projectId).toBe('p-home');
  });

  it('finds nothing when there are no projects', () => {
    expect(run('Fix the sink Home', []).fields.projectId).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/* spans, dismissal and purity                                                 */
/* -------------------------------------------------------------------------- */

describe('spans point at the right characters', () => {
  it('covers exactly the matched words', () => {
    const text = 'Take the garbage out every 2 days important home';
    const result = capture(text, PROJECTS, NOW);

    expect(result.used.map((m) => text.slice(m.start, m.end))).toEqual([
      'every 2 days',
      'important',
      'home',
    ]);
  });
});

describe('tapping a chip off', () => {
  const text = 'Call Mum about the important meeting';

  it('claims a word it should not, which is the designed trade', () => {
    // §2.7: matching anywhere guarantees wrong reads. The protection is that
    // every one is visible and one tap undoes it.
    expect(capture(text, PROJECTS, NOW).fields.important).toBe(true);
  });

  it('returns the words to the title when dismissed', () => {
    const dismissed = new Set(['importance:important']);
    const result = capture(text, PROJECTS, NOW, dismissed);

    expect(result.title).toBe(text);
    expect(result.fields.important).toBeUndefined();
    expect(result.used).toEqual([]);
  });

  it('keeps an id stable when text is typed in front of it', () => {
    const before = parse('important thing', PROJECTS, NOW).map((m) => m.id);
    const after = parse('a very important thing', PROJECTS, NOW).map((m) => m.id);
    expect(after).toEqual(expect.arrayContaining(before));
  });
});

describe('the parser is pure', () => {
  it('gives the same answer for the same inputs', () => {
    const once = capture('Gym every Monday important', PROJECTS, NOW);
    const twice = capture('Gym every Monday important', PROJECTS, NOW);
    expect(once).toEqual(twice);
  });

  it('finds nothing in an empty line rather than throwing', () => {
    expect(capture('', PROJECTS, NOW)).toEqual({ title: '', fields: {}, used: [] });
  });

  it('leaves an ordinary sentence completely alone', () => {
    const result = run('Send the quarterly report to Ayşe');
    expect(result.title).toBe('Send the quarterly report to Ayşe');
    expect(result.fields).toEqual({});
  });
});

/* -------------------------------------------------------------------------- */
/* the fold                                                                    */
/* -------------------------------------------------------------------------- */

describe('the case fold', () => {
  it('never changes the length, because spans index back into the original', () => {
    for (const word of ['İstanbul', 'YARIN', 'Important', 'ıslak', 'Çağrı', 'straße']) {
      expect(fold(word)).toHaveLength(word.length);
    }
  });

  it('collapses all four I forms to one', () => {
    expect(fold('İIıi')).toBe('iiii');
  });

  it('leaves English keywords matchable', () => {
    // A `toLocaleLowerCase('tr')` would turn this into `ımportant` and break it.
    expect(fold('Important')).toBe('important');
  });
});
