import { EventEmitter } from 'node:events';
import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import { SERVER_TIME_HEADER, type SyncedCollection } from '@corvonium/shared';
import { hasToken } from './auth';
import type { Store } from './db';
import { registerStream } from './routes/stream';
import { registerSync } from './routes/sync';

export type ServerOptions = {
  store: Store;
  token: string;
  origins: string[];
  /** How often an idle stream sends a keep-alive comment. */
  heartbeatMs?: number;
  logger?: boolean;
};

/** Raised after a push writes something: which collection changed. */
export type Changes = EventEmitter<{ change: [collection: SyncedCollection] }>;

/**
 * The sync server — §9. Built here and started in `index.ts`, so tests get the
 * exact same app without a port or a file on disk.
 */
export async function buildServer(options: ServerOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? false,
    // A first push from a device with years of data arrives as a few large batches.
    bodyLimit: 8 * 1024 * 1024,
  });

  const changes: Changes = new EventEmitter();
  // Every open app on every device holds one stream; the default cap of 10 is a warning, not a limit.
  changes.setMaxListeners(0);

  /*
    CORS first, so a browser's preflight is answered before the token check runs:
    a preflight never carries the Authorization header, by design.
  */
  await app.register(cors, {
    origin: options.origins,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    // Without this a browser hides the header from the app.
    exposedHeaders: [SERVER_TIME_HEADER],
    maxAge: 600,
  });

  /*
    Every response says what time the server thinks it is. Devices stamp their
    writes in server time, so a device with a wrong clock cannot win conflicts it
    should lose — §7, open question 2.
  */
  app.addHook('onRequest', async (_request, reply) => {
    reply.header(SERVER_TIME_HEADER, String(Date.now()));
  });

  /*
    The app is served from a public origin and the server lives on a private
    Tailscale address. Chrome asks the server to opt in to that explicitly
    (Private Network Access); only an allowed origin is told yes.
  */
  app.addHook('onSend', async (request, reply) => {
    const origin = request.headers.origin;
    if (
      request.headers['access-control-request-private-network'] === 'true' &&
      origin !== undefined &&
      options.origins.includes(origin)
    ) {
      reply.header('Access-Control-Allow-Private-Network', 'true');
    }
  });

  app.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/sync') || request.method === 'OPTIONS') return;
    if (!hasToken(request.headers.authorization, options.token)) {
      await reply.code(401).send({ error: 'unauthorized' });
    }
  });

  // Unauthenticated on purpose: "is anything listening?" without handing out a token.
  app.get('/health', async () => ({ ok: true }));

  registerSync(app, options.store, changes);
  registerStream(app, changes, options.heartbeatMs ?? 25_000);

  return app;
}
