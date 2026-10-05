import type { OutgoingHttpHeaders, ServerResponse } from 'node:http';
import type { FastifyInstance } from 'fastify';
import type { SyncedCollection } from '@corvonium/shared';
import type { Changes } from '../app';

/**
 * `GET /sync/stream` — server-sent events, §7.
 *
 * It says only *which collection changed*; the device then pulls as usual. Sending
 * the documents themselves would be a second sync path to keep correct.
 *
 * Plain text over a held-open response. The client reads it with `fetch` rather
 * than `EventSource`, because `EventSource` cannot send the Authorization header —
 * §7, open question 4.
 */
export function registerStream(app: FastifyInstance, changes: Changes, heartbeatMs: number) {
  const open = new Set<ServerResponse>();

  app.get('/sync/stream', (request, reply) => {
    // Taken over from Fastify: a stream has no single response body to send.
    reply.hijack();
    const raw = reply.raw;

    // Keeps the CORS headers the plugin already set for this request.
    const already = Object.fromEntries(
      Object.entries(reply.getHeaders()).filter(([, value]) => value !== undefined),
    ) as OutgoingHttpHeaders;

    raw.writeHead(200, {
      ...already,
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      // Proxies — Tailscale serve included — must not buffer events.
      'x-accel-buffering': 'no',
    });
    raw.write('event: ready\ndata: {}\n\n');

    const onChange = (collection: SyncedCollection) => {
      raw.write(`event: change\ndata: ${JSON.stringify({ collection })}\n\n`);
    };
    // A comment line: ignored by readers, but keeps idle connections from being cut.
    const heartbeat = setInterval(() => raw.write(': heartbeat\n\n'), heartbeatMs);

    changes.on('change', onChange);
    open.add(raw);

    request.raw.on('close', () => {
      clearInterval(heartbeat);
      changes.off('change', onChange);
      open.delete(raw);
    });
  });

  // An open stream never ends by itself, so shutting down has to end them.
  app.addHook('preClose', async () => {
    for (const raw of open) raw.end();
  });
}
