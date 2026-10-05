import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { PullResponse, PushResponse, PushRow, SyncDoc } from '@corvonium/shared';
import { buildServer } from './app';
import { openStore, type Store } from './db';

const TOKEN = 'test-token-that-is-long-enough-000000000000';
const ORIGIN = 'https://corvonium.mustafakaangungor.net';
const auth = { authorization: `Bearer ${TOKEN}` };

const doc = (id: string, over: Partial<SyncDoc> = {}): SyncDoc => ({
  id,
  title: id,
  updatedAt: 100,
  _deleted: false,
  ...over,
});

const open: { app: FastifyInstance; store: Store }[] = [];

async function setup(storePath = ':memory:') {
  const store = openStore(storePath);
  const app = await buildServer({ store, token: TOKEN, origins: [ORIGIN], heartbeatMs: 50 });
  open.push({ app, store });
  return { app, store };
}

afterEach(async () => {
  await Promise.all(
    open.splice(0).map(async ({ app, store }) => {
      await app.close();
      store.close();
    }),
  );
});

async function push(app: FastifyInstance, collection: string, rows: PushRow[]) {
  const res = await app.inject({
    method: 'POST',
    url: `/sync/${collection}/push`,
    headers: auth,
    payload: rows,
  });
  return { status: res.statusCode, body: res.json() as PushResponse };
}

async function pull(app: FastifyInstance, collection: string, after = 0, limit?: number) {
  const query = `after=${after}${limit === undefined ? '' : `&limit=${limit}`}`;
  const res = await app.inject({
    method: 'GET',
    url: `/sync/${collection}/pull?${query}`,
    headers: auth,
  });
  return { status: res.statusCode, body: res.json() as PullResponse };
}

describe('the token', () => {
  it('is required on every sync route', async () => {
    const { app } = await setup();

    const urls = ['/sync/status', '/sync/items/pull', '/sync/stream'];
    const responses = await Promise.all(urls.map((url) => app.inject({ url })));
    expect(responses.map((r) => r.statusCode)).toEqual([401, 401, 401]);
    expect(
      (await app.inject({ method: 'POST', url: '/sync/items/push', payload: [] })).statusCode,
    ).toBe(401);
  });

  it('refuses a wrong one, and a right one without the Bearer prefix', async () => {
    const { app } = await setup();

    const wrong = await app.inject({
      url: '/sync/status',
      headers: { authorization: 'Bearer nope' },
    });
    const bare = await app.inject({ url: '/sync/status', headers: { authorization: TOKEN } });

    expect(wrong.statusCode).toBe(401);
    expect(bare.statusCode).toBe(401);
  });

  it('is not needed to see that the server is up', async () => {
    const { app } = await setup();
    const res = await app.inject({ url: '/health' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });
});

describe('bad requests', () => {
  it('404s a collection that is not synced', async () => {
    const { app } = await setup();

    expect((await pull(app, 'settings')).status).toBe(404);
    expect((await push(app, '__proto__', [])).status).toBe(404);
  });

  it('400s a push that is not a list of documents', async () => {
    const { app } = await setup();
    const bad = async (payload: unknown) =>
      (
        await app.inject({
          method: 'POST',
          url: '/sync/items/push',
          headers: auth,
          payload: payload as object,
        })
      ).statusCode;

    expect(await bad({ id: 'a' })).toBe(400);
    expect(await bad([{ newDocumentState: { title: 'no id' } }])).toBe(400);
    expect(
      await bad([{ newDocumentState: doc('a', { _deleted: 'no' as unknown as boolean }) }]),
    ).toBe(400);
    // The assumed state must be about the same document.
    expect(await bad([{ assumedMasterState: doc('b'), newDocumentState: doc('a') }])).toBe(400);
  });

  it('400s a pull with a checkpoint that is not a whole number', async () => {
    const { app } = await setup();
    const res = await app.inject({ url: '/sync/items/pull?after=-1', headers: auth });
    expect(res.statusCode).toBe(400);
  });
});

describe('push and pull', () => {
  it('returns what was pushed, in the order it was written', async () => {
    const { app } = await setup();
    await push(app, 'items', [{ newDocumentState: doc('a') }, { newDocumentState: doc('b') }]);
    await push(app, 'items', [{ newDocumentState: doc('c') }]);

    const { status, body } = await pull(app, 'items');
    expect(status).toBe(200);
    expect(body.documents.map((d) => d.id)).toEqual(['a', 'b', 'c']);
    expect(body.checkpoint).toEqual({ seq: 3 });
  });

  it('pages by checkpoint without skipping or repeating anything', async () => {
    const { app } = await setup();
    await push(
      app,
      'items',
      ['a', 'b', 'c', 'd', 'e'].map((id) => ({ newDocumentState: doc(id) })),
    );

    const seen: string[] = [];
    let after = 0;
    for (;;) {
      // Paging is sequential by nature: each page starts where the last one ended.
      // eslint-disable-next-line no-await-in-loop
      const { body } = await pull(app, 'items', after, 2);
      if (body.documents.length === 0) break;
      seen.push(...body.documents.map((d) => d.id));
      after = body.checkpoint.seq;
    }

    expect(seen).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('keeps the checkpoint where it was when there is nothing new', async () => {
    const { app } = await setup();
    await push(app, 'items', [{ newDocumentState: doc('a') }]);

    expect((await pull(app, 'items', 1)).body).toEqual({ documents: [], checkpoint: { seq: 1 } });
  });

  it('keeps collections apart', async () => {
    const { app } = await setup();
    await push(app, 'items', [{ newDocumentState: doc('same-id', { title: 'an item' }) }]);
    await push(app, 'projects', [{ newDocumentState: doc('same-id', { title: 'a project' }) }]);

    expect((await pull(app, 'items')).body.documents).toEqual([
      doc('same-id', { title: 'an item' }),
    ]);
    expect((await pull(app, 'projects')).body.documents).toEqual([
      doc('same-id', { title: 'a project' }),
    ]);
  });
});

describe('the sequence, not the clock, decides what is new', () => {
  /*
    §7, open question 1. A device offline for three days pushes documents stamped
    three days ago. A checkpoint on `updatedAt` would put them behind everything
    other devices have already pulled, and nobody would ever receive them.
  */
  it('delivers a late push from a long-offline device to a device that already pulled', async () => {
    const { app } = await setup();
    const now = 1_000_000_000;
    const threeDays = 3 * 24 * 60 * 60 * 1000;

    await push(app, 'items', [{ newDocumentState: doc('fresh', { updatedAt: now }) }]);
    const first = await pull(app, 'items');

    // The offline device finally connects, with an item it made three days ago.
    await push(app, 'items', [{ newDocumentState: doc('old', { updatedAt: now - threeDays }) }]);
    const next = await pull(app, 'items', first.body.checkpoint.seq);

    expect(next.body.documents.map((d) => d.id)).toEqual(['old']);
  });

  it('moves an edited document after everything written before the edit', async () => {
    const { app } = await setup();
    await push(app, 'items', [{ newDocumentState: doc('a') }, { newDocumentState: doc('b') }]);
    const { body } = await pull(app, 'items');

    await push(app, 'items', [
      {
        assumedMasterState: doc('a'),
        newDocumentState: doc('a', { title: 'edited', updatedAt: 200 }),
      },
    ]);

    const after = await pull(app, 'items', body.checkpoint.seq);
    expect(after.body.documents).toEqual([doc('a', { title: 'edited', updatedAt: 200 })]);
  });

  it('is shared across collections, so it only ever grows', async () => {
    const { app } = await setup();
    await push(app, 'items', [{ newDocumentState: doc('a') }]);
    await push(app, 'projects', [{ newDocumentState: doc('p') }]);
    await push(app, 'items', [{ newDocumentState: doc('b') }]);

    expect((await pull(app, 'items')).body.checkpoint).toEqual({ seq: 3 });
  });
});

describe('conflicts', () => {
  it("refuses to overwrite a version the device never saw, and hands back the server's copy", async () => {
    const { app } = await setup();
    await push(app, 'items', [{ newDocumentState: doc('a', { title: 'v1' }) }]);
    // Another device edits it first.
    await push(app, 'items', [
      {
        assumedMasterState: doc('a', { title: 'v1' }),
        newDocumentState: doc('a', { title: 'v2', updatedAt: 200 }),
      },
    ]);

    // This device still thinks v1 is current.
    const { body } = await push(app, 'items', [
      {
        assumedMasterState: doc('a', { title: 'v1' }),
        newDocumentState: doc('a', { title: 'mine', updatedAt: 300 }),
      },
    ]);

    expect(body.conflicts).toEqual([doc('a', { title: 'v2', updatedAt: 200 })]);
    // …and wrote nothing: deciding is the client's job.
    expect((await pull(app, 'items')).body.documents).toEqual([
      doc('a', { title: 'v2', updatedAt: 200 }),
    ]);
  });

  it('treats a push with no assumed state as a conflict when the server has the document', async () => {
    const { app } = await setup();
    await push(app, 'items', [{ newDocumentState: doc('a', { title: 'server' }) }]);

    const { body } = await push(app, 'items', [{ newDocumentState: doc('a', { title: 'blind' }) }]);
    expect(body.conflicts.map((d) => d.title)).toEqual(['server']);
  });

  it('writes the rest of a batch when only some rows conflict', async () => {
    const { app } = await setup();
    await push(app, 'items', [{ newDocumentState: doc('a') }]);

    const { body } = await push(app, 'items', [
      { newDocumentState: doc('a', { title: 'blind' }) },
      { newDocumentState: doc('b') },
    ]);

    expect(body.conflicts.map((d) => d.id)).toEqual(['a']);
    expect((await pull(app, 'items')).body.documents.map((d) => d.id)).toEqual(['a', 'b']);
  });

  it('does not count key order as a different version', async () => {
    const { app } = await setup();
    await push(app, 'items', [{ newDocumentState: doc('a') }]);

    const reordered = { _deleted: false, updatedAt: 100, title: 'a', id: 'a' } satisfies SyncDoc;
    const { body } = await push(app, 'items', [
      {
        assumedMasterState: reordered,
        newDocumentState: doc('a', { title: 'edited', updatedAt: 200 }),
      },
    ]);

    expect(body.conflicts).toEqual([]);
  });

  it('reads a null assumed state as "no copy on the server yet"', async () => {
    // RxDB sends this for a session that was held back while it was running.
    const { app } = await setup();
    const res = await app.inject({
      method: 'POST',
      url: '/sync/sessions/push',
      headers: auth,
      payload: [{ assumedMasterState: null, newDocumentState: doc('s') }],
    });

    expect(res.statusCode).toBe(200);
    expect((res.json() as PushResponse).conflicts).toEqual([]);

    const again = await app.inject({
      method: 'POST',
      url: '/sync/sessions/push',
      headers: auth,
      payload: [{ assumedMasterState: null, newDocumentState: doc('s', { title: 'blind' }) }],
    });
    expect((again.json() as PushResponse).conflicts.map((d) => d.id)).toEqual(['s']);
  });

  it('lets a device refill a brand-new server it believes it synced with before', async () => {
    // §5: stand a new server up empty; the first device to connect pushes everything.
    const { app } = await setup();
    const { body } = await push(app, 'items', [
      { assumedMasterState: doc('a'), newDocumentState: doc('a') },
    ]);

    expect(body.conflicts).toEqual([]);
    expect((await pull(app, 'items')).body.documents).toHaveLength(1);
  });
});

describe('deletions and status', () => {
  it('pulls a tombstone like any other change, and stops counting it', async () => {
    const { app } = await setup();
    await push(app, 'items', [{ newDocumentState: doc('a') }, { newDocumentState: doc('b') }]);
    await push(app, 'items', [
      {
        assumedMasterState: doc('a'),
        newDocumentState: doc('a', { _deleted: true, updatedAt: 200 }),
      },
    ]);

    const { body } = await pull(app, 'items', 2);
    expect(body.documents).toEqual([doc('a', { _deleted: true, updatedAt: 200 })]);

    const status = await app.inject({ url: '/sync/status', headers: auth });
    expect(status.json()).toEqual({
      ok: true,
      collections: { items: 1, projects: 0, sessions: 0 },
    });
  });
});

/** A browser's CORS preflight for a push, from `origin`. */
function preflight(app: FastifyInstance, origin: string, extra: Record<string, string> = {}) {
  return app.inject({
    method: 'OPTIONS',
    url: '/sync/items/push',
    headers: {
      origin,
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'authorization,content-type',
      ...extra,
    },
  });
}

describe('CORS', () => {
  it('answers a preflight from the app without asking for the token', async () => {
    const { app } = await setup();
    const res = await preflight(app, ORIGIN);

    expect(res.statusCode).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe(ORIGIN);
    expect(String(res.headers['access-control-allow-headers']).toLowerCase()).toContain(
      'authorization',
    );
  });

  it('does not allow any other site', async () => {
    const { app } = await setup();
    const res = await preflight(app, 'https://evil.example');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it("opts in to Chrome's private network check for the app only", async () => {
    const { app } = await setup();
    const ask = { 'access-control-request-private-network': 'true' };

    expect(
      (await preflight(app, ORIGIN, ask)).headers['access-control-allow-private-network'],
    ).toBe('true');
    expect(
      (await preflight(app, 'https://evil.example', ask)).headers[
        'access-control-allow-private-network'
      ],
    ).toBeUndefined();
  });
});

/** Read a stream until `predicate` has seen what it wants, or give up. */
async function readUntil(res: Response, predicate: (text: string) => boolean, timeoutMs = 2000) {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let text = '';
  const deadline = Date.now() + timeoutMs;

  while (!predicate(text) && Date.now() < deadline) {
    // A stream arrives one chunk at a time; each read has to wait for the last.
    // eslint-disable-next-line no-await-in-loop
    const chunk = await Promise.race([
      reader.read(),
      new Promise<{ done: true; value: undefined }>((r) =>
        setTimeout(() => r({ done: true, value: undefined }), deadline - Date.now()),
      ),
    ]);
    if (chunk.done) break;
    text += decoder.decode(chunk.value, { stream: true });
  }

  await reader.cancel();
  return text;
}

describe('the live stream', () => {
  it('says which collection changed when something is pushed, with the token as a header', async () => {
    const { app } = await setup();
    const address = await app.listen({ host: '127.0.0.1', port: 0 });

    const res = await fetch(`${address}/sync/stream`, { headers: { ...auth, origin: ORIGIN } });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    // The CORS headers survive the stream taking over the response.
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN);

    const received = readUntil(res, (t) => t.includes('event: change'));
    await new Promise((r) => setTimeout(r, 50));
    await fetch(`${address}/sync/projects/push`, {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify([{ newDocumentState: doc('p') }]),
    });

    const text = await received;
    expect(text).toContain('event: ready');
    expect(text).toContain('event: change\ndata: {"collection":"projects"}');
  });

  it('keeps an idle connection alive with heartbeats', async () => {
    const { app } = await setup();
    const address = await app.listen({ host: '127.0.0.1', port: 0 });

    const res = await fetch(`${address}/sync/stream`, { headers: auth });
    expect(await readUntil(res, (t) => t.includes(': heartbeat'))).toContain(': heartbeat');
  });

  it('refuses a stream without the token', async () => {
    const { app } = await setup();
    const address = await app.listen({ host: '127.0.0.1', port: 0 });

    expect((await fetch(`${address}/sync/stream`)).status).toBe(401);
  });
});

describe('the database file', () => {
  it('keeps its data and does not re-run migrations when opened again', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'corvonium-server-'));
    const path = join(dir, 'corvonium.db');

    try {
      const first = openStore(path);
      first.push('items', [{ newDocumentState: doc('a') }]);
      first.close();

      const again = openStore(path);
      expect(again.pull('items', 0, 10).documents).toEqual([doc('a')]);
      again.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
