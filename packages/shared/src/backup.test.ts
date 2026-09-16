import { describe, expect, it } from 'vitest';
import {
  backupFileName,
  compare,
  countWrites,
  isIdentical,
  makeBackup,
  mergeWrites,
  readBackup,
  type SchemaVersions,
  type Snapshot,
} from './backup';
import type { Item, Project, Session } from './types';

const V: SchemaVersions = { items: 0, projects: 0, sessions: 0 };
const T0 = new Date(2026, 8, 14, 18, 0).getTime();
const MIN = 60_000;

function item(id: string, updatedAt = T0, over: Partial<Item> = {}): Item {
  return {
    id,
    title: id,
    notes: '',
    kind: 'task',
    allDay: false,
    start: null,
    end: null,
    startDate: null,
    endDate: null,
    due: null,
    tzid: null,
    rrule: null,
    seriesId: null,
    originalStart: null,
    status: 'open',
    completedAt: null,
    cancelledAt: null,
    projectId: null,
    location: null,
    important: false,
    sortOrder: 'a0',
    createdAt: T0,
    updatedAt,
    ...over,
  };
}

function project(id: string, updatedAt = T0): Project {
  return {
    id,
    name: id,
    color: '#fff',
    archived: false,
    sortOrder: 'a0',
    createdAt: T0,
    updatedAt,
  };
}

function session(id: string, over: Partial<Session> = {}): Session {
  return {
    id,
    startedAt: T0,
    endedAt: null,
    segments: [{ kind: 'work', itemIds: [], startedAt: T0, endedAt: null }],
    lastSeenAt: T0,
    createdAt: T0,
    updatedAt: T0,
    ...over,
  };
}

function snap(over: Partial<Snapshot> = {}): Snapshot {
  return { items: [], projects: [], sessions: [], ...over };
}

const text = (value: unknown) => JSON.stringify(value);

describe('readBackup', () => {
  it('round-trips what makeBackup produced', () => {
    const data = snap({ items: [item('a')], projects: [project('p')], sessions: [session('s')] });
    const result = readBackup(text(makeBackup(data, V, T0)), V);

    expect(result).toEqual({ ok: true, backup: makeBackup(data, V, T0) });
  });

  const good = () =>
    makeBackup(snap({ items: [item('a')] }), V, T0) as unknown as Record<string, unknown>;

  it.each([
    ['not JSON', '{ nope', /isn't valid JSON/],
    ['JSON that is not an object', '[1, 2]', /isn't a Corvonium backup/],
    ["another app's file", text({ ...good(), app: 'notion' }), /isn't a Corvonium backup/],
    ['a newer envelope', text({ ...good(), format: 2 }), /newer Corvonium/],
    ['a newer schema', text({ ...good(), schemaVersions: { ...V, items: 1 } }), /newer Corvonium/],
    ['no header', text({ app: 'corvonium' }), /header is incomplete/],
    ['a missing collection', text({ ...good(), data: { items: [], projects: [] } }), /no sessions/],
    [
      'a document without an id',
      text({ ...good(), data: { items: [{ title: 'x' }], projects: [], sessions: [] } }),
      /some items have no id/,
    ],
  ])('refuses %s, with a reason', (_label, input, reason) => {
    const result = readBackup(input, V);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(reason);
  });

  it('refuses a file older than the schemas it would be stored under', () => {
    const result = readBackup(text(good()), { ...V, items: 1 });
    expect(result.ok).toBe(false);
  });
});

describe('backupFileName', () => {
  it('is dated in local time', () => {
    expect(backupFileName(new Date(2026, 8, 6, 23, 30).getTime())).toBe(
      'corvonium-2026-09-06.json',
    );
  });
});

describe('compare', () => {
  it('sorts every document into exactly one bucket', () => {
    const device = snap({
      items: [item('same'), item('mine-newer', T0 + 2), item('file-newer', T0), item('only-here')],
    });
    const file = snap({
      items: [item('same'), item('mine-newer', T0), item('file-newer', T0 + 5), item('only-file')],
    });

    expect(compare(device, file).items).toEqual({
      here: 4,
      inFile: 4,
      onlyHere: 1,
      onlyInFile: 1,
      same: 1,
      newerInFile: 1,
      newerHere: 1,
      lastChangeHere: T0 + 2,
      lastChangeInFile: T0 + 5,
    });
  });

  it('reports no last change for an empty side', () => {
    const c = compare(snap(), snap({ projects: [project('p', T0 + 9)] })).projects;
    expect(c.lastChangeHere).toBeNull();
    expect(c.lastChangeInFile).toBe(T0 + 9);
  });

  it('calls two copies of the same data identical, and one difference not', () => {
    const data = snap({ items: [item('a')], sessions: [session('s')] });
    expect(isIdentical(compare(data, data))).toBe(true);
    expect(isIdentical(compare(data, snap({ ...data, projects: [project('p')] })))).toBe(false);
  });
});

describe('mergeWrites', () => {
  it('adds what only the file has and takes the newer version of the rest', () => {
    const device = snap({ items: [item('a', T0), item('b', T0 + 5)] });
    const file = snap({ items: [item('a', T0 + 1), item('b', T0), item('c')] });

    expect(mergeWrites(device, file).items.map((i) => i.id)).toEqual(['a', 'c']);
  });

  it('keeps the device copy on a tie, even if the contents differ', () => {
    const device = snap({ items: [item('a', T0, { title: 'mine' })] });
    const file = snap({ items: [item('a', T0, { title: 'theirs' })] });

    expect(mergeWrites(device, file).items).toEqual([]);
  });

  it('never deletes: a document only on the device is not mentioned', () => {
    const device = snap({ items: [item('keep')], projects: [project('p')] });
    const writes = mergeWrites(device, snap());

    expect(writes).toEqual(snap());
  });

  it('leaves exactly one running session when both sides had one', () => {
    const mine = session('mine', { lastSeenAt: T0 + 30 * MIN });
    const theirs = session('theirs', { lastSeenAt: T0 + 10 * MIN });

    const writes = mergeWrites(snap({ sessions: [mine] }), snap({ sessions: [theirs] }));
    const byId = new Map(writes.sessions.map((s) => [s.id, s]));

    // The one seen longer ago is imported already ended where it was last seen.
    expect(byId.get('theirs')?.endedAt).toBe(T0 + 10 * MIN);
    expect(byId.get('theirs')?.segments.every((s) => s.endedAt !== null)).toBe(true);
    // The device's own is still running, and untouched.
    expect(byId.has('mine')).toBe(false);
  });

  it("ends the device's own session when the file's was seen more recently", () => {
    const mine = session('mine', { lastSeenAt: T0 + 5 * MIN, updatedAt: T0 + 20 * MIN });
    const theirs = session('theirs', { lastSeenAt: T0 + 40 * MIN });

    const writes = mergeWrites(snap({ sessions: [mine] }), snap({ sessions: [theirs] }));
    const ended = writes.sessions.find((s) => s.id === 'mine');

    expect(ended?.endedAt).toBe(T0 + 5 * MIN);
    // Never older than the version it replaces, or the next merge would undo it.
    expect(ended?.updatedAt).toBe(T0 + 20 * MIN);
    expect(writes.sessions.find((s) => s.id === 'theirs')?.endedAt).toBeNull();
  });

  it('leaves a single running session alone', () => {
    const writes = mergeWrites(snap(), snap({ sessions: [session('only')] }));
    expect(writes.sessions[0]?.endedAt).toBeNull();
  });
});

describe('countWrites', () => {
  it('tells new documents from updates, across collections', () => {
    const device = snap({ items: [item('a')] });
    const writes = snap({ items: [item('a', T0 + 1), item('b')], projects: [project('p')] });

    expect(countWrites(device, writes)).toEqual({ added: 2, updated: 1 });
  });
});
