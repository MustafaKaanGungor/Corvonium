import { describe, expect, it } from 'vitest';
import { createDeviceClock } from './deviceClock';
import { normalizeServerUrl } from './deviceConfig';
import { parseEvents } from './eventStream';

describe('normalizeServerUrl', () => {
  it.each([
    ['https://my-pc.tail1234.ts.net', 'https://my-pc.tail1234.ts.net'],
    ['  https://my-pc.tail1234.ts.net/  ', 'https://my-pc.tail1234.ts.net'],
    ['my-pc.tail1234.ts.net', 'https://my-pc.tail1234.ts.net'],
    ['HTTPS://My-PC.tail1234.ts.net', 'https://my-pc.tail1234.ts.net'],
    ['https://home.example/corvonium/', 'https://home.example/corvonium'],
    ['http://localhost:8787', 'http://localhost:8787'],
    ['http://127.0.0.1:8787/', 'http://127.0.0.1:8787'],
  ])('accepts %s as %s', (input, expected) => {
    expect(normalizeServerUrl(input)).toEqual({ ok: true, url: expected });
  });

  it.each([
    ['', /Enter the server address/],
    ['   ', /Enter the server address/],
    // An HTTPS app cannot call plain HTTP anywhere but this machine.
    ['http://my-pc.tail1234.ts.net', /must start with https/],
    ['ftp://my-pc', /must start with https/],
    ['https://', /doesn't look like an address/],
  ])('refuses %j', (input, reason) => {
    const result = normalizeServerUrl(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(reason);
  });
});

describe('parseEvents', () => {
  it('reads named events and keeps an unfinished one for later', () => {
    const { events, rest } = parseEvents(
      'event: ready\ndata: {}\n\nevent: change\ndata: {"collection":"items"}\n\nevent: cha',
    );

    expect(events).toEqual([
      { event: 'ready', data: '{}' },
      { event: 'change', data: '{"collection":"items"}' },
    ]);
    expect(rest).toBe('event: cha');
  });

  it('completes an event split across two chunks', () => {
    const first = parseEvents('event: change\nda');
    const second = parseEvents(`${first.rest}ta: {"collection":"projects"}\n\n`);

    expect(first.events).toEqual([]);
    expect(second.events).toEqual([{ event: 'change', data: '{"collection":"projects"}' }]);
  });

  it('ignores heartbeats', () => {
    expect(parseEvents(': heartbeat\n\n: heartbeat\n\n').events).toEqual([]);
  });

  it('copes with CRLF line endings, as some proxies send', () => {
    expect(parseEvents('event: ready\r\ndata: {}\r\n\r\n').events).toEqual([
      { event: 'ready', data: '{}' },
    ]);
  });
});

describe('createDeviceClock', () => {
  it('is the local clock until it has heard from the server', () => {
    const clock = createDeviceClock({ local: () => 1_000, storageKey: null });
    expect(clock.now()).toBe(1_000);
  });

  it('corrects a fast clock to server time', () => {
    let local = 1_300_000;
    const clock = createDeviceClock({ local: () => local, storageKey: null });

    clock.observe(1_000_050, 1_300_000, 1_300_100);
    local = 1_400_000;

    expect(clock.now()).toBe(1_100_000);
  });

  it('keeps its correction when a measurement is too slow to trust', () => {
    const clock = createDeviceClock({ local: () => 10_000, storageKey: null });
    clock.observe(9_000, 10_000, 10_000);
    clock.observe(50_000, 0, 9_000);

    expect(clock.now()).toBe(9_000);
  });

  it('remembers its correction across launches', () => {
    const key = `test.clock.${Math.random()}`;
    createDeviceClock({ local: () => 10_000, storageKey: key }).observe(9_000, 10_000, 10_000);

    expect(createDeviceClock({ local: () => 20_000, storageKey: key }).now()).toBe(19_000);
    localStorage.removeItem(key);
  });
});
