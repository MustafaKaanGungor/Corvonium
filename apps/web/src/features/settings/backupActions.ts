import {
  backupFileName,
  compare,
  makeBackup,
  readBackup,
  type Backup,
  type Comparison,
  type Snapshot,
} from '@corvonium/shared';
import { readSnapshot, SCHEMA_VERSIONS } from '../../db/backup';
import { checkDocuments } from '../../db/schema/check';
import { saveFile } from '../../lib/saveFile';

/** Everything the review screen needs, gathered before anything is written. */
export type ImportReviewData = {
  backup: Backup;
  /** The device as it was when the comparison was drawn. Merging reads it again. */
  device: Snapshot;
  comparison: Comparison;
};

const LAST_EXPORT_KEY = 'corvonium.lastExportAt';

/**
 * When a backup was last saved from this device, or `null`.
 *
 * `localStorage`, not the database: it is a fact about this device, and it must
 * not travel inside the very backups it is counting.
 */
export function lastExportAt(): number | null {
  try {
    const value = Number(localStorage.getItem(LAST_EXPORT_KEY));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

export async function exportBackup(now: number): Promise<'saved' | 'cancelled'> {
  const backup = makeBackup(await readSnapshot(), SCHEMA_VERSIONS, now);
  const outcome = await saveFile(
    backupFileName(now),
    JSON.stringify(backup, null, 2),
    'application/json',
  );

  if (outcome === 'saved') {
    try {
      localStorage.setItem(LAST_EXPORT_KEY, String(now));
    } catch {
      // Storage refused: the backup still happened, the reminder just won't know.
    }
  }
  return outcome;
}

/**
 * Read a chosen file all the way to a comparison, or explain why it can't be used.
 * Nothing is written here — that waits for a choice on the review screen.
 */
export async function prepareImport(
  file: File,
): Promise<{ ok: true; review: ImportReviewData } | { ok: false; reason: string }> {
  let text: string;
  try {
    text = await file.text();
  } catch {
    return { ok: false, reason: 'That file could not be read.' };
  }

  const read = readBackup(text, SCHEMA_VERSIONS);
  if (!read.ok) return read;

  const problem = checkDocuments(read.backup.data);
  if (problem !== null) return { ok: false, reason: problem };

  const device = await readSnapshot();
  return {
    ok: true,
    review: { backup: read.backup, device, comparison: compare(device, read.backup.data) },
  };
}
