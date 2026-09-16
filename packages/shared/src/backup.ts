import { endSession } from './sessions';
import type { Item, Project, Session } from './types';

/**
 * Backups — plan §10, *Import and export*.
 *
 * Everything that decides something lives here: what a valid file is, how it
 * differs from the device, and what a merge writes. Reading and writing the
 * database stays in the app, so all of this is testable without one.
 */

export const COLLECTIONS = ['items', 'projects', 'sessions'] as const;
export type CollectionName = (typeof COLLECTIONS)[number];

/** Every stored document, as stored. Nothing derived, no occurrences. */
export type Snapshot = { items: Item[]; projects: Project[]; sessions: Session[] };

export type SchemaVersions = Record<CollectionName, number>;

/** Bumped only when the envelope itself changes; schema changes use `schemaVersions`. */
export const BACKUP_FORMAT = 1;

export type Backup = {
  app: 'corvonium';
  format: typeof BACKUP_FORMAT;
  exportedAt: number;
  schemaVersions: SchemaVersions;
  data: Snapshot;
};

export function makeBackup(snapshot: Snapshot, versions: SchemaVersions, now: number): Backup {
  return {
    app: 'corvonium',
    format: BACKUP_FORMAT,
    exportedAt: now,
    schemaVersions: versions,
    data: snapshot,
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** `corvonium-2026-09-16.json`, in local time — the day you made it. */
export function backupFileName(now: number): string {
  const d = new Date(now);
  return `corvonium-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
}

export type ReadResult = { ok: true; backup: Backup } | { ok: false; reason: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Check a file's envelope and hand back a typed backup, or a reason fit to show.
 *
 * This checks *shape*, not every field: the app validates each document against
 * its own database schemas, which is the only definition of a field that exists.
 * `versions` is what this build stores, so a file from a newer build is refused
 * rather than half-understood.
 */
export function readBackup(text: string, versions: SchemaVersions): ReadResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: "This file isn't valid JSON, so it can't be a Corvonium backup." };
  }

  if (!isRecord(parsed) || parsed.app !== 'corvonium') {
    return { ok: false, reason: "This isn't a Corvonium backup." };
  }

  if (typeof parsed.format !== 'number' || typeof parsed.exportedAt !== 'number') {
    return { ok: false, reason: 'This backup is damaged: its header is incomplete.' };
  }
  if (parsed.format > BACKUP_FORMAT) {
    return {
      ok: false,
      reason: 'This backup was made by a newer Corvonium. Update the app first.',
    };
  }

  const fileVersions = parsed.schemaVersions;
  const data = parsed.data;
  if (!isRecord(fileVersions) || !isRecord(data)) {
    return { ok: false, reason: 'This backup is damaged: its header is incomplete.' };
  }

  for (const name of COLLECTIONS) {
    const version = fileVersions[name];
    if (typeof version !== 'number') {
      return { ok: false, reason: 'This backup is damaged: its header is incomplete.' };
    }
    if (version > versions[name]) {
      return {
        ok: false,
        reason: 'This backup was made by a newer Corvonium. Update the app first.',
      };
    }
    // Older files need a migration, and there is no older schema yet to migrate from.
    if (version < versions[name]) {
      return {
        ok: false,
        reason: 'This backup is from an older Corvonium that can no longer be read.',
      };
    }

    const docs = data[name];
    if (!Array.isArray(docs)) {
      return { ok: false, reason: `This backup is damaged: it has no ${name}.` };
    }
    if (!docs.every((doc) => isRecord(doc) && typeof doc.id === 'string' && doc.id !== '')) {
      return { ok: false, reason: `This backup is damaged: some ${name} have no id.` };
    }
  }

  return { ok: true, backup: parsed as unknown as Backup };
}

/* -------------------------------------------------------------------------- */
/* comparing                                                                  */
/* -------------------------------------------------------------------------- */

type Doc = { id: string; updatedAt: number };

export type CollectionComparison = {
  here: number;
  inFile: number;
  onlyHere: number;
  onlyInFile: number;
  /**
   * The same id at the same `updatedAt`. Every write stamps `updatedAt`, so this is
   * "the same version", without comparing field by field.
   */
  same: number;
  newerInFile: number;
  newerHere: number;
  /** Latest `updatedAt` on each side, or `null` when that side is empty. */
  lastChangeHere: number | null;
  lastChangeInFile: number | null;
};

export type Comparison = Record<CollectionName, CollectionComparison>;

function latest(docs: Doc[]): number | null {
  return docs.length === 0 ? null : Math.max(...docs.map((d) => d.updatedAt));
}

function compareDocs(here: Doc[], file: Doc[]): CollectionComparison {
  const byId = new Map(here.map((d) => [d.id, d]));
  const result: CollectionComparison = {
    here: here.length,
    inFile: file.length,
    onlyHere: 0,
    onlyInFile: 0,
    same: 0,
    newerInFile: 0,
    newerHere: 0,
    lastChangeHere: latest(here),
    lastChangeInFile: latest(file),
  };

  const fileIds = new Set<string>();
  for (const doc of file) {
    fileIds.add(doc.id);
    const mine = byId.get(doc.id);
    if (mine === undefined) result.onlyInFile++;
    else if (doc.updatedAt > mine.updatedAt) result.newerInFile++;
    else if (doc.updatedAt < mine.updatedAt) result.newerHere++;
    else result.same++;
  }
  result.onlyHere = here.filter((d) => !fileIds.has(d.id)).length;

  return result;
}

export function compare(device: Snapshot, file: Snapshot): Comparison {
  return {
    items: compareDocs(device.items, file.items),
    projects: compareDocs(device.projects, file.projects),
    sessions: compareDocs(device.sessions, file.sessions),
  };
}

/** Nothing either side has that the other lacks or holds a different version of. */
export function isIdentical(comparison: Comparison): boolean {
  return COLLECTIONS.every((name) => {
    const c = comparison[name];
    return c.onlyHere === 0 && c.onlyInFile === 0 && c.newerInFile === 0 && c.newerHere === 0;
  });
}

/* -------------------------------------------------------------------------- */
/* merging                                                                    */
/* -------------------------------------------------------------------------- */

/** The file's documents that should replace or join the device's. */
function winners<T extends Doc>(here: T[], file: T[]): T[] {
  const byId = new Map(here.map((d) => [d.id, d]));
  // Strictly newer: on a tie the device keeps its copy, and nothing is rewritten.
  return file.filter((doc) => {
    const mine = byId.get(doc.id);
    return mine === undefined || doc.updatedAt > mine.updatedAt;
  });
}

/**
 * What a merge writes: every document the file has that the device lacks, and
 * every one where the file's version is newer. **Nothing is ever deleted** — a
 * document only on the device is simply not mentioned.
 *
 * One rule on top: **at most one running session.** Work Mode assumes a single
 * live session, and a merge of two devices that each have one running would
 * break that. The one last seen longer ago is ended where it was last seen —
 * the same answer the forgotten-session failsafe gives.
 */
export function mergeWrites(device: Snapshot, file: Snapshot): Snapshot {
  const sessions = winners(device.sessions, file.sessions);

  // The sessions as they will be after the merge, to find the live ones.
  const written = new Map(sessions.map((s) => [s.id, s]));
  const after = [
    ...device.sessions.map((s) => written.get(s.id) ?? s),
    ...sessions.filter((s) => !device.sessions.some((d) => d.id === s.id)),
  ];
  const live = after
    .filter((s) => s.endedAt === null)
    .toSorted((a, b) => b.lastSeenAt - a.lastSeenAt);

  for (const stale of live.slice(1)) {
    written.set(stale.id, {
      ...endSession(stale, stale.lastSeenAt),
      // `endSession` stamps the end instant, which can be older than this version.
      // Moving `updatedAt` backwards would let the running copy win the next merge.
      updatedAt: Math.max(stale.updatedAt, stale.lastSeenAt),
    });
  }

  return {
    items: winners(device.items, file.items),
    projects: winners(device.projects, file.projects),
    sessions: [...written.values()],
  };
}

/** How many of a merge's writes are new documents, and how many update one. */
export function countWrites(
  device: Snapshot,
  writes: Snapshot,
): { added: number; updated: number } {
  let added = 0;
  let updated = 0;

  for (const name of COLLECTIONS) {
    const ids = new Set(device[name].map((d) => d.id));
    for (const doc of writes[name]) {
      if (ids.has(doc.id)) updated++;
      else added++;
    }
  }

  return { added, updated };
}
