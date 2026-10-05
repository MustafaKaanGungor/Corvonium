import { BehaviorSubject, Subject, combineLatest } from 'rxjs';
import type { RxCollection, RxReplicationPullStreamItem } from 'rxdb';
import { replicateRxCollection, type RxReplicationState } from 'rxdb/plugins/replication';
import {
  SERVER_TIME_HEADER,
  shouldPush,
  SYNCED_COLLECTIONS,
  type Checkpoint,
  type PullResponse,
  type PushResponse,
  type StatusResponse,
  type SyncedCollection,
} from '@corvonium/shared';
import { deviceClock, type DeviceClock } from '../lib/deviceClock';
import { openEventStream } from '../lib/eventStream';
import type { SyncConfig } from '../lib/deviceConfig';
import type { CorvoniumDatabase } from './database';

/**
 * Replication — §7. Each collection replicates on its own, through the server's
 * pull and push routes; the stream only says *when* to pull.
 */

export type SyncStatus = 'connecting' | 'syncing' | 'synced' | 'offline' | 'unauthorized' | 'error';

export type SyncState = {
  status: SyncStatus;
  /** When everything was last known to match the server. */
  lastSyncedAt: number | null;
};

export type SyncController = {
  state$: BehaviorSubject<SyncState>;
  /** Pull now — after focus, reconnecting, or a change on another device. */
  reSync(): void;
  /** Resolves once every collection has nothing left to send or receive. */
  awaitInSync(): Promise<void>;
  stop(): Promise<void>;
};

type Problem = 'offline' | 'unauthorized' | 'error' | null;

class HttpError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`sync server answered ${status}`);
    this.status = status;
  }
}

/** What the Settings screen needs to know before saving an address and token. */
export type ServerCheck =
  | { ok: true; counts: StatusResponse['collections'] }
  | { ok: false; reason: 'unreachable' | 'unauthorized' | 'not-corvonium' };

export async function checkServer(
  config: SyncConfig,
  doFetch: typeof fetch = fetch,
): Promise<ServerCheck> {
  let res: Response;
  try {
    res = await doFetch(`${config.url}/sync/status`, {
      headers: { Authorization: `Bearer ${config.token}` },
      cache: 'no-store',
    });
  } catch {
    return { ok: false, reason: 'unreachable' };
  }

  if (res.status === 401) return { ok: false, reason: 'unauthorized' };
  if (!res.ok) return { ok: false, reason: 'not-corvonium' };

  try {
    const body = (await res.json()) as Partial<StatusResponse>;
    return body.ok === true && body.collections !== undefined
      ? { ok: true, counts: body.collections }
      : { ok: false, reason: 'not-corvonium' };
  } catch {
    return { ok: false, reason: 'not-corvonium' };
  }
}

export function startSync(
  db: CorvoniumDatabase,
  config: SyncConfig,
  options: {
    fetch?: typeof fetch;
    /** Only one tab should replicate. Tests run one "device" per database and skip it. */
    waitForLeadership?: boolean;
    /** The live stream; tests that want to control timing turn it off. */
    stream?: boolean;
    retryTime?: number;
    /** Corrected by every response. Must be the same clock the database stamps with. */
    clock?: DeviceClock;
  } = {},
): SyncController {
  const doFetch = options.fetch ?? ((input, init) => fetch(input, init));
  const headers = { Authorization: `Bearer ${config.token}` };

  const problem$ = new BehaviorSubject<Problem>(null);
  const state$ = new BehaviorSubject<SyncState>({ status: 'connecting', lastSyncedAt: null });

  const clock = options.clock ?? deviceClock;

  /** Every request goes through here, so the status reflects what actually happened. */
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    let res: Response;
    const sentAt = clock.local();
    try {
      res = await doFetch(`${config.url}${path}`, {
        ...init,
        headers: { ...headers, ...init.headers },
        cache: 'no-store',
      });
    } catch (err) {
      problem$.next('offline');
      throw err;
    }

    // Every answer doubles as a clock reading, so stamps stay in server time.
    const serverTime = Number(res.headers.get(SERVER_TIME_HEADER));
    if (serverTime > 0) clock.observe(serverTime, sentAt, clock.local());

    if (!res.ok) {
      problem$.next(res.status === 401 ? 'unauthorized' : 'error');
      throw new HttpError(res.status);
    }

    problem$.next(null);
    return (await res.json()) as T;
  }

  const streams = new Map<
    SyncedCollection,
    Subject<RxReplicationPullStreamItem<unknown, Checkpoint>>
  >();
  const replications: RxReplicationState<unknown, Checkpoint>[] = [];

  for (const name of SYNCED_COLLECTIONS) {
    const stream$ = new Subject<RxReplicationPullStreamItem<unknown, Checkpoint>>();
    streams.set(name, stream$);

    const replication = replicateRxCollection<unknown, Checkpoint>({
      collection: db[name] as unknown as RxCollection<unknown>,
      /*
        The server address is part of the identity: pointed at a different server —
        the home server, later — a device starts from checkpoint zero and pushes
        everything it has, which is exactly how a new server gets filled (§5).
      */
      replicationIdentifier: `corvonium-${name}-${config.url}`,
      live: true,
      retryTime: options.retryTime ?? 5000,
      waitForLeadership: options.waitForLeadership ?? true,
      autoStart: true,
      deletedField: '_deleted',

      pull: {
        batchSize: 200,
        stream$: stream$.asObservable(),
        handler: (checkpoint, batchSize) =>
          request<PullResponse>(
            `/sync/${name}/pull?after=${checkpoint?.seq ?? 0}&limit=${batchSize}`,
          ) as Promise<{ documents: never[]; checkpoint: Checkpoint }>,
      },

      push: {
        batchSize: 100,
        // A running session stays on this device until it ends — §12.
        modifier: (doc) => (shouldPush(name, doc as Record<string, unknown>) ? doc : null),
        handler: async (rows) => {
          /*
            RxDB runs the modifier over the assumed state too. For a session that
            just ended, the state RxDB remembers is the *running* one it never sent,
            so the modifier turns it into `null`. It means "the server has no copy
            yet", and goes out as an absent field rather than a null one.
          */
          const clean = rows.map(({ assumedMasterState, newDocumentState }) =>
            assumedMasterState == null
              ? { newDocumentState }
              : { assumedMasterState, newDocumentState },
          );
          const body = await request<PushResponse>(`/sync/${name}/push`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(clean),
          });
          return body.conflicts as never[];
        },
      },
    });

    // Failures are already reflected in the status; this only keeps them from
    // surfacing as unhandled errors.
    replication.error$.subscribe(() => {
      if (problem$.value === null) problem$.next('error');
    });

    replications.push(replication);
  }

  const resyncAll = () => streams.forEach((stream$) => stream$.next('RESYNC'));

  /* ---- status ---- */

  let initialDone = false;
  void Promise.all(replications.map((r) => r.awaitInitialReplication())).then(() => {
    initialDone = true;
    problem$.next(problem$.value);
  });

  const subscription = combineLatest([
    problem$,
    combineLatest(replications.map((r) => r.active$)),
  ]).subscribe(([problem, active]) => {
    const busy = active.some(Boolean);
    const previous = state$.value;

    const status: SyncStatus =
      problem ?? (!initialDone ? 'connecting' : busy ? 'syncing' : 'synced');
    const lastSyncedAt = status === 'synced' ? Date.now() : previous.lastSyncedAt;

    if (status !== previous.status || lastSyncedAt !== previous.lastSyncedAt) {
      state$.next({ status, lastSyncedAt });
    }
  });

  /* ---- when to pull ---- */

  const closeStream =
    options.stream === false
      ? () => {}
      : openEventStream({
          url: `${config.url}/sync/stream`,
          token: config.token,
          fetch: doFetch,
          onEvent: ({ event, data }) => {
            if (event === 'ready') {
              // Connected, or reconnected after a gap: catch up on anything missed.
              resyncAll();
            } else if (event === 'change') {
              try {
                const { collection } = JSON.parse(data) as { collection: SyncedCollection };
                streams.get(collection)?.next('RESYNC');
              } catch {
                resyncAll();
              }
            }
          },
        });

  const onWake = () => {
    if (typeof document === 'undefined' || document.visibilityState === 'visible') resyncAll();
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('online', onWake);
    window.addEventListener('focus', onWake);
    document.addEventListener('visibilitychange', onWake);
  }

  return {
    state$,
    reSync: resyncAll,
    async awaitInSync() {
      await Promise.all(replications.map((r) => r.awaitInSync()));
    },
    async stop() {
      closeStream();
      subscription.unsubscribe();
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', onWake);
        window.removeEventListener('focus', onWake);
        document.removeEventListener('visibilitychange', onWake);
      }
      await Promise.all(replications.map((r) => r.cancel()));
    },
  };
}
