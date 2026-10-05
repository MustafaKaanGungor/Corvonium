import { DatabaseSync } from 'node:sqlite';
import {
  sameDocument,
  SYNCED_COLLECTIONS,
  type Checkpoint,
  type PullResponse,
  type PushRow,
  type SyncDoc,
  type SyncedCollection,
} from '@corvonium/shared';

/**
 * The server's storage — §7, *dumb by design*.
 *
 * One table holds every document as JSON, keyed by collection and id. The server
 * never reads a field beyond `id` and `_deleted`, so changing what an item looks
 * like never needs a migration here. `node:sqlite` is built into Node 24: nothing
 * native is compiled, on Windows or in Docker.
 */

/**
 * Applied in order, each exactly once, recorded in `migrations`. Append only:
 * editing a shipped entry would leave existing databases on the old version of it.
 */
const MIGRATIONS: string[] = [
  `CREATE TABLE documents (
     collection TEXT    NOT NULL,
     id         TEXT    NOT NULL,
     seq        INTEGER NOT NULL UNIQUE,
     data       TEXT    NOT NULL,
     PRIMARY KEY (collection, id)
   );
   CREATE INDEX documents_by_seq ON documents (collection, seq);`,
];

function migrate(db: DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS migrations (
             version    INTEGER PRIMARY KEY,
             applied_at INTEGER NOT NULL
           )`);

  const row = db.prepare('SELECT MAX(version) AS version FROM migrations').get() as
    { version: number | null } | undefined;
  const applied = row?.version ?? 0;

  for (const [index, sql] of MIGRATIONS.entries()) {
    const version = index + 1;
    if (version <= applied) continue;

    transaction(db, () => {
      db.exec(sql);
      db.prepare('INSERT INTO migrations (version, applied_at) VALUES (?, ?)').run(
        version,
        Date.now(),
      );
    });
  }
}

/** `node:sqlite` has no transaction helper; a failure part-way must leave nothing behind. */
function transaction<T>(db: DatabaseSync, work: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export type Store = ReturnType<typeof openStore>;

/** Open (or create) the store. `:memory:` gives a throwaway one, which is what tests use. */
export function openStore(path: string) {
  const db = new DatabaseSync(path);
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL');
  migrate(db);

  const selectOne = db.prepare('SELECT data FROM documents WHERE collection = ? AND id = ?');
  const selectAfter = db.prepare(
    'SELECT seq, data FROM documents WHERE collection = ? AND seq > ? ORDER BY seq LIMIT ?',
  );
  const nextSeq = db.prepare('SELECT COALESCE(MAX(seq), 0) + 1 AS seq FROM documents');
  const upsert = db.prepare(
    `INSERT INTO documents (collection, id, seq, data) VALUES (?, ?, ?, ?)
     ON CONFLICT (collection, id) DO UPDATE SET seq = excluded.seq, data = excluded.data`,
  );
  const countLive = db.prepare(
    `SELECT COUNT(*) AS n FROM documents
     WHERE collection = ? AND COALESCE(json_extract(data, '$._deleted'), 0) = 0`,
  );

  return {
    /**
     * Documents changed after `checkpoint`, oldest change first.
     *
     * The sequence is **global and only ever grows**: every write takes the next
     * number, whichever collection it is in. So a document a long-offline device
     * pushes today lands *after* everything already pulled, and nobody skips it.
     */
    pull(collection: SyncedCollection, after: number, limit: number): PullResponse {
      const rows = selectAfter.all(collection, after, limit) as { seq: number; data: string }[];
      const last = rows.at(-1);
      const checkpoint: Checkpoint = { seq: last?.seq ?? after };

      return { documents: rows.map((r) => JSON.parse(r.data) as SyncDoc), checkpoint };
    },

    /**
     * Write each row whose device saw the version the server still holds; return
     * the server's copy for every row that did not. All in one transaction.
     *
     * Deciding a conflict is the client's job (`resolveConflict`). The server only
     * refuses to overwrite a version the pusher never saw.
     *
     * A document the server has no copy of is always written, even if the device
     * thinks it was synced before. That is what lets a **brand-new, empty server**
     * be filled back up by the first device that connects — §5.
     */
    push(collection: SyncedCollection, rows: PushRow[]): { conflicts: SyncDoc[]; written: number } {
      return transaction(db, () => {
        const conflicts: SyncDoc[] = [];
        let written = 0;

        for (const row of rows) {
          const doc = row.newDocumentState;
          const stored = selectOne.get(collection, doc.id) as { data: string } | undefined;
          const current = stored === undefined ? undefined : (JSON.parse(stored.data) as SyncDoc);

          if (current !== undefined && !sameDocument(current, row.assumedMasterState)) {
            conflicts.push(current);
            continue;
          }

          const { seq } = nextSeq.get() as { seq: number };
          upsert.run(collection, doc.id, seq, JSON.stringify(doc));
          written++;
        }

        return { conflicts, written };
      });
    },

    /** Live documents per collection — tombstones are not counted. */
    counts(): Record<SyncedCollection, number> {
      return Object.fromEntries(
        SYNCED_COLLECTIONS.map((name) => [name, (countLive.get(name) as { n: number }).n]),
      ) as Record<SyncedCollection, number>;
    },

    close() {
      db.close();
    },
  };
}
