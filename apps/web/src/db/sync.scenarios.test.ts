// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { createItem, endSession, startSession, type Item } from '@corvonium/shared';
import { buildServer } from '@corvonium/server';
import { openStore, type Store } from '@corvonium/server/db';
import { createDeviceClock } from '../lib/deviceClock';
import { createDatabase, type CorvoniumDatabase } from './database';
import { startSync, type SyncController } from './replication';

/**
 * §10's sync scenarios: two devices — two real databases with the app's own
 * conflict handler and hooks — replicating through the real server over HTTP.
 * These are the tests that let sync be changed later without fear.
 */

const TOKEN = 'scenario-token-0000000000000000000000000000';
const MIN = 60_000;
const DAY = 24 * 60 * MIN;

let server: Awaited<ReturnType<typeof buildServer>>;
let store: Store;
let url: string;
const cleanups: (() => Promise<void>)[] = [];

beforeEach(async () => {
  store = openStore(':memory:');
  server = await buildServer({ store, token: TOKEN, origins: [] });
  url = await server.listen({ host: '127.0.0.1', port: 0 });
});

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).toReversed()) {
    // Devices stop before the server does, one at a time.
    // eslint-disable-next-line no-await-in-loop
    await cleanup();
  }
  await server.close();
  store.close();
});

type Device = {
  db: CorvoniumDatabase;
  sync: SyncController;
  /** Pull the plug: every request fails as if there were no network. */
  online: boolean;
};

let counter = 0;

async function device(options: { stream?: boolean; clockSkewMs?: number } = {}): Promise<Device> {
  // Each device has its own clock, possibly wrong, and learns the server's.
  const clock = createDeviceClock({
    local: () => Date.now() + (options.clockSkewMs ?? 0),
    storageKey: null,
  });
  const db = await createDatabase({
    name: `device${++counter}${Date.now()}`,
    storage: getRxStorageMemory(),
    multiInstance: false,
    clock,
  });

  const self = { db, online: true } as Device;
  const net: typeof fetch = (input, init) =>
    self.online ? fetch(input, init) : Promise.reject(new TypeError('offline'));

  self.sync = startSync(
    db,
    { url, token: TOKEN },
    {
      fetch: net,
      waitForLeadership: false,
      stream: options.stream ?? false,
      retryTime: 30,
      clock,
    },
  );

  cleanups.push(async () => {
    await self.sync.stop();
    await db.remove();
  });
  return self;
}

/** Wait until `check` passes, or fail with its last error. */
async function eventually(check: () => Promise<void> | void, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await check();
      return;
    } catch (err) {
      if (Date.now() > deadline) throw err;
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 25));
    }
  }
}

/** Push everything pending on each device, then have each pull. */
async function settle(...devices: Device[]) {
  for (const d of devices) {
    d.sync.reSync();
    // eslint-disable-next-line no-await-in-loop
    await d.sync.awaitInSync();
  }
  for (const d of devices) {
    d.sync.reSync();
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 60));
    // eslint-disable-next-line no-await-in-loop
    await d.sync.awaitInSync();
  }
}

const tick = () => new Promise((r) => setTimeout(r, 5));

async function add(d: Device, title: string, over: Partial<Item> = {}, at = Date.now()) {
  const item = createItem({ title, ...over }, at, crypto.randomUUID());
  await d.db.items.insert(item);
  return item.id;
}

/** An edit the way the app makes one: stamped with this device's idea of now. */
async function edit(d: Device, id: string, fields: Partial<Item>, now = Date.now()) {
  const doc = await d.db.items.findOne(id).exec();
  await doc!.incrementalPatch({ ...fields, updatedAt: now });
}

async function titleOn(d: Device, id: string) {
  return (await d.db.items.findOne(id).exec())?.title ?? null;
}

describe('two devices, one server', () => {
  it('delivers an item added on one device to the other', async () => {
    const a = await device();
    const b = await device();

    const id = await add(a, 'Buy milk');
    await settle(a, b);

    expect(await titleOn(b, id)).toBe('Buy milk');
  });

  it('delivers within moments through the live stream, with nobody asking', async () => {
    const a = await device({ stream: true });
    const b = await device({ stream: true });
    await settle(a, b);

    const id = await add(a, 'Arrives on its own');

    await eventually(async () => expect(await titleOn(b, id)).toBe('Arrives on its own'));
  });

  it('combines two devices that each had their own data before connecting', async () => {
    const a = await device();
    const b = await device();
    const fromA = await add(a, 'Only on the phone');
    const fromB = await add(b, 'Only on the PC');

    await settle(a, b, a);

    expect(await titleOn(a, fromB)).toBe('Only on the PC');
    expect(await titleOn(b, fromA)).toBe('Only on the phone');
  });
});

describe('the same item changed in two places', () => {
  it('keeps the newer edit on both, whichever device was offline', async () => {
    const a = await device();
    const b = await device();
    const id = await add(a, 'Original');
    await settle(a, b);

    a.online = false;
    await edit(a, id, { title: 'Older edit, made offline' });
    await tick();
    await edit(b, id, { title: 'Newer edit' });
    await settle(b);

    a.online = true;
    await settle(a, b, a);

    expect(await titleOn(a, id)).toBe('Newer edit');
    expect(await titleOn(b, id)).toBe('Newer edit');
  });

  it('lets the offline edit win when it is the newer one', async () => {
    const a = await device();
    const b = await device();
    const id = await add(a, 'Original');
    await settle(a, b);

    a.online = false;
    await edit(b, id, { title: 'Older edit' });
    await settle(b);
    await tick();
    await edit(a, id, { title: 'Newer edit, made offline' });

    a.online = true;
    await settle(a, b, a);

    expect(await titleOn(a, id)).toBe('Newer edit, made offline');
    expect(await titleOn(b, id)).toBe('Newer edit, made offline');
  });
});

describe('deleting', () => {
  it('removes the item everywhere', async () => {
    const a = await device();
    const b = await device();
    const id = await add(a, 'Delete me');
    await settle(a, b);

    await (await a.db.items.findOne(id).exec())!.remove();
    await settle(a, b);

    expect(await b.db.items.findOne(id).exec()).toBeNull();
  });

  it('lets a later edit on another device win over an earlier delete, on both', async () => {
    const a = await device();
    const b = await device();
    const id = await add(a, 'Contested');
    await settle(a, b);

    a.online = false;
    await (await a.db.items.findOne(id).exec())!.remove();
    await tick();
    await edit(b, id, { title: 'Edited after the delete' });
    await settle(b);

    a.online = true;
    await settle(a, b, a);

    expect(await titleOn(a, id)).toBe('Edited after the delete');
    expect(await titleOn(b, id)).toBe('Edited after the delete');
  });

  it('lets a later delete win over an earlier edit, on both', async () => {
    const a = await device();
    const b = await device();
    const id = await add(a, 'Contested');
    await settle(a, b);

    a.online = false;
    await edit(b, id, { title: 'Edited before the delete' });
    await settle(b);
    await tick();
    // The delete is stamped when it happens — not with the item's old timestamp.
    await (await a.db.items.findOne(id).exec())!.remove();

    a.online = true;
    await settle(a, b, a);

    expect(await a.db.items.findOne(id).exec()).toBeNull();
    expect(await b.db.items.findOne(id).exec()).toBeNull();
  });
});

describe('clocks and time', () => {
  it('delivers what a device made while offline for three days', async () => {
    const a = await device();
    const b = await device();
    await add(b, 'Something to have pulled already');
    await settle(b, a);

    a.online = false;
    const id = await add(a, 'Made on the plane', {}, Date.now() - 3 * DAY);

    a.online = true;
    await settle(a, b);

    expect(await titleOn(b, id)).toBe('Made on the plane');
  });

  it('keeps an edit made on top of a fast-clock device’s version', async () => {
    const fast = await device({ clockSkewMs: 5 * MIN });
    const honest = await device();

    const id = await add(fast, 'Written by the fast clock', {}, Date.now() + 5 * MIN);
    await settle(fast, honest);

    await edit(honest, id, { title: 'Edited afterwards' });
    await settle(honest, fast);

    expect(await titleOn(fast, id)).toBe('Edited afterwards');
    expect(await titleOn(honest, id)).toBe('Edited afterwards');
  });

  /*
    §7, open question 2 — the case that actually needs the clock correction. Two
    devices edit the same item at the same time, so last-write-wins compares their
    stamps. Stamped with its own clock, the device five minutes fast would win
    every one of these, whichever edit really came last.
  */
  it('lets the later of two simultaneous edits win, against a clock five minutes fast', async () => {
    const fast = await device({ clockSkewMs: 5 * MIN });
    const honest = await device();
    const id = await add(honest, 'Original');
    // The fast device hears the server's clock here.
    await settle(honest, fast);

    fast.online = false;
    await edit(fast, id, { title: 'Earlier edit, on the fast clock' });
    await new Promise((r) => setTimeout(r, 40));
    await edit(honest, id, { title: 'Later edit' });
    await settle(honest);

    fast.online = true;
    await settle(fast, honest, fast);

    expect(await titleOn(fast, id)).toBe('Later edit');
    expect(await titleOn(honest, id)).toBe('Later edit');
  });
});

describe('Work Mode sessions', () => {
  it('keeps a running session on its device, and sends it once it ends', async () => {
    const a = await device();
    const b = await device();

    const started = startSession(Date.now(), crypto.randomUUID());
    await a.db.sessions.insert(started);
    await settle(a, b);

    expect(store.counts().sessions).toBe(0);
    expect(await b.db.sessions.findOne(started.id).exec()).toBeNull();

    const doc = await a.db.sessions.findOne(started.id).exec();
    await doc!.incrementalModify((current) => endSession(current, Date.now() + 1));
    await settle(a, b);

    expect((await b.db.sessions.findOne(started.id).exec())?.endedAt).not.toBeNull();
  });
});

describe('status', () => {
  it('reports synced, offline, and a rejected token', async () => {
    const a = await device();
    await settle(a);
    await eventually(() => expect(a.sync.state$.value.status).toBe('synced'));
    expect(a.sync.state$.value.lastSyncedAt).not.toBeNull();

    a.online = false;
    await add(a, 'Waiting for the network');
    await eventually(() => expect(a.sync.state$.value.status).toBe('offline'));

    const wrong = await createDatabase({
      name: `wrongtoken${Date.now()}`,
      storage: getRxStorageMemory(),
      multiInstance: false,
    });
    const rejected = startSync(
      wrong,
      { url, token: 'not-the-token' },
      { waitForLeadership: false, stream: false, retryTime: 30 },
    );
    cleanups.push(async () => {
      await rejected.stop();
      await wrong.remove();
    });

    await eventually(() => expect(rejected.state$.value.status).toBe('unauthorized'));
  });
});
