/**
 * A server-sent events reader built on `fetch` — §7, open question 4.
 *
 * `EventSource` cannot send an Authorization header, and putting the token in the
 * URL would write it into every proxy and server log it passes. So the stream is
 * read by hand: it carries the same header as every other request.
 */

export type StreamEvent = { event: string; data: string };

/**
 * Split buffered text into complete events, returning what is left over.
 * Pure, so the framing rules can be tested without a network.
 */
export function parseEvents(buffer: string): { events: StreamEvent[]; rest: string } {
  const normalised = buffer.replace(/\r\n?/g, '\n');
  const blocks = normalised.split('\n\n');
  const rest = blocks.pop() ?? '';

  const events: StreamEvent[] = [];
  for (const block of blocks) {
    let event = 'message';
    const data: string[] = [];

    for (const line of block.split('\n')) {
      if (line === '' || line.startsWith(':')) continue; // comments are heartbeats
      const colon = line.indexOf(':');
      const field = colon === -1 ? line : line.slice(0, colon);
      const value = colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '');

      if (field === 'event') event = value;
      else if (field === 'data') data.push(value);
    }

    if (data.length > 0 || event !== 'message') events.push({ event, data: data.join('\n') });
  }

  return { events, rest };
}

/**
 * Hold a stream open, reconnecting with backoff whenever it drops. Never throws:
 * a stream that cannot connect only means changes arrive on the next retry or
 * focus instead of within a second.
 *
 * Returns a function that closes it for good.
 */
export function openEventStream(options: {
  url: string;
  token: string;
  onEvent: (event: StreamEvent) => void;
  fetch?: typeof fetch;
}): () => void {
  const doFetch = options.fetch ?? fetch;
  let closed = false;
  let controller: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let delay = 1000;

  async function connect() {
    controller = new AbortController();
    try {
      const res = await doFetch(options.url, {
        headers: { Authorization: `Bearer ${options.token}`, Accept: 'text/event-stream' },
        signal: controller.signal,
        cache: 'no-store',
      });
      if (!res.ok || res.body === null) throw new Error(`stream refused: ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      delay = 1000;

      for (;;) {
        // One chunk at a time is the nature of a stream.
        // eslint-disable-next-line no-await-in-loop
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parsed = parseEvents(buffer);
        buffer = parsed.rest;
        parsed.events.forEach(options.onEvent);
      }
    } catch {
      // Dropped, refused or offline — all handled the same way, below.
    }

    if (closed) return;
    timer = setTimeout(() => void connect(), delay);
    delay = Math.min(delay * 2, 30_000);
  }

  void connect();

  return () => {
    closed = true;
    if (timer !== null) clearTimeout(timer);
    controller?.abort();
  };
}
