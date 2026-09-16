import { describe, expect, it } from 'vitest';
import type { Item, Project, Session, Snapshot } from '@corvonium/shared';
import { checkDocuments } from './check';

const T0 = new Date(2026, 8, 14, 18, 0).getTime();

/** Shaped exactly like `doc.toJSON()` from the real collections. */
const item: Item = {
  id: '6d1f3c1e-0000-4000-8000-000000000001',
  title: 'Take the bins out',
  notes: '',
  kind: 'task',
  allDay: false,
  start: null,
  end: null,
  startDate: null,
  endDate: null,
  due: T0,
  tzid: null,
  rrule: 'FREQ=DAILY;INTERVAL=2',
  seriesId: null,
  originalStart: null,
  status: 'open',
  completedAt: null,
  cancelledAt: null,
  projectId: 'p1',
  location: null,
  important: true,
  sortOrder: 'a0',
  createdAt: T0,
  updatedAt: T0,
};

const project: Project = {
  id: 'p1',
  name: 'Home',
  color: '#E0A040',
  archived: false,
  sortOrder: 'a0',
  createdAt: T0,
  updatedAt: T0,
};

const session: Session = {
  id: 's1',
  startedAt: T0,
  endedAt: null,
  segments: [{ kind: 'work', itemIds: [item.id], startedAt: T0, endedAt: null }],
  lastSeenAt: T0,
  createdAt: T0,
  updatedAt: T0,
};

const snapshot = (over: Partial<Snapshot> = {}): Snapshot => ({
  items: [item],
  projects: [project],
  sessions: [session],
  ...over,
});

/** A document with one field broken, typed loosely because that is the point. */
const broken = <T>(doc: T, change: Record<string, unknown>) => ({ ...doc, ...change }) as T;

describe('checkDocuments against the real schemas', () => {
  it('accepts documents exactly as the app stores them', () => {
    expect(checkDocuments(snapshot())).toBeNull();
    expect(checkDocuments(snapshot({ items: [], projects: [], sessions: [] }))).toBeNull();
  });

  it('refuses a field of the wrong type, and names the item', () => {
    const problem = checkDocuments(snapshot({ items: [broken(item, { due: 'tomorrow' })] }));
    expect(problem).toMatch(/“Take the bins out”/);
    expect(problem).toMatch(/item\.due should be number or null, not string/);
  });

  it('refuses a missing required field', () => {
    const { status: _status, ...rest } = item;
    expect(checkDocuments(snapshot({ items: [rest as Item] }))).toMatch(/item\.status is missing/);
  });

  it('refuses a value outside an enum', () => {
    expect(checkDocuments(snapshot({ items: [broken(item, { status: 'maybe' })] }))).toMatch(
      /item\.status has an unknown value "maybe"/,
    );
  });

  it('refuses a field the schema does not have', () => {
    expect(checkDocuments(snapshot({ projects: [broken(project, { _rev: '1-abc' })] }))).toMatch(
      /project\._rev is not a known field/,
    );
  });

  it('looks inside nested segments', () => {
    const bad = broken(session, {
      segments: [{ kind: 'nap', itemIds: [], startedAt: T0, endedAt: null }],
    });
    expect(checkDocuments(snapshot({ sessions: [bad] }))).toMatch(/segments\[0\]\.kind/);
  });

  it('refuses a number that is not one', () => {
    // JSON cannot carry NaN, but a hand-built snapshot can.
    expect(checkDocuments(snapshot({ items: [broken(item, { createdAt: Number.NaN })] }))).toMatch(
      /createdAt should be number/,
    );
  });
});
