import type { FastifyInstance } from 'fastify';
import {
  isSyncedCollection,
  type PullResponse,
  type PushResponse,
  type PushRow,
  type StatusResponse,
} from '@corvonium/shared';
import type { Changes } from '../app';
import type { Store } from '../db';

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The minimum a document needs for the server to store and order it. */
function isSyncDoc(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    value.id.length <= 200 &&
    typeof value.updatedAt === 'number' &&
    typeof value._deleted === 'boolean'
  );
}

function isPushRows(body: unknown): body is PushRow[] {
  return (
    Array.isArray(body) &&
    body.every(
      (row) =>
        isRecord(row) &&
        isSyncDoc(row.newDocumentState) &&
        // `null` is accepted as "no assumed state", the same as leaving it out.
        (row.assumedMasterState === undefined ||
          row.assumedMasterState === null ||
          (isSyncDoc(row.assumedMasterState) &&
            (row.assumedMasterState as { id: string }).id ===
              (row.newDocumentState as { id: string }).id)),
    )
  );
}

/** A non-negative integer from a query string, or `null` if it is anything else. */
function wholeNumber(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) ? n : null;
}

type CollectionParams = { collection: string };

/** Status, pull and push — §7. Everything here is behind the token check in `app.ts`. */
export function registerSync(app: FastifyInstance, store: Store, changes: Changes) {
  app.get('/sync/status', async (): Promise<StatusResponse> => ({
    ok: true,
    collections: store.counts(),
  }));

  app.get<{ Params: CollectionParams; Querystring: { after?: string; limit?: string } }>(
    '/sync/:collection/pull',
    async (request, reply): Promise<PullResponse | undefined> => {
      const { collection } = request.params;
      if (!isSyncedCollection(collection)) {
        return reply.code(404).send({ error: 'unknown collection' });
      }

      const after = request.query.after === undefined ? 0 : wholeNumber(request.query.after);
      const limit =
        request.query.limit === undefined ? DEFAULT_LIMIT : wholeNumber(request.query.limit);
      if (after === null || limit === null || limit < 1) {
        return reply.code(400).send({ error: 'after and limit must be whole numbers' });
      }

      return store.pull(collection, after, Math.min(limit, MAX_LIMIT));
    },
  );

  app.post<{ Params: CollectionParams }>(
    '/sync/:collection/push',
    async (request, reply): Promise<PushResponse | undefined> => {
      const { collection } = request.params;
      if (!isSyncedCollection(collection)) {
        return reply.code(404).send({ error: 'unknown collection' });
      }
      if (!isPushRows(request.body)) {
        return reply.code(400).send({ error: 'expected an array of push rows' });
      }

      const { conflicts, written } = store.push(collection, request.body);
      if (written > 0) changes.emit('change', collection);

      return { conflicts };
    },
  );
}
