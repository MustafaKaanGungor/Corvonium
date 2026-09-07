import { useSyncExternalStore } from 'react';

export type Screen = 'today' | 'tasks' | 'calendar' | 'stats';

const SCREENS: Screen[] = ['today', 'tasks', 'calendar', 'stats'];

/** Today is the default landing screen — plan §3.1. */
const DEFAULT: Screen = 'today';

export type Route = {
  screen: Screen;
  params: URLSearchParams;
};

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

function getHash(): string {
  return window.location.hash;
}

function parse(hash: string): Route {
  // '#/tasks?filter=missed' → screen 'tasks', params { filter: 'missed' }
  const raw = hash.replace(/^#\/?/, '');
  const [path = '', query = ''] = raw.split('?');
  const screen = SCREENS.find((s) => s === path) ?? DEFAULT;
  return { screen, params: new URLSearchParams(query) };
}

/**
 * The current screen, read from the URL hash.
 *
 * Routing through the URL rather than component state is what makes the Android
 * back gesture move between screens instead of closing the installed PWA. It also
 * turns Today's "See all" rows into real links.
 *
 * `useSyncExternalStore` is the React primitive for external mutable state like
 * `location.hash` — a `useState` + effect pair can render one frame behind it.
 */
export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, getHash, () => '');
  return parse(hash);
}

export function navigate(screen: Screen, params?: Record<string, string>): void {
  const query = new URLSearchParams(params).toString();
  window.location.hash = `/${screen}${query ? `?${query}` : ''}`;
}

/** An href for the same destination, so links behave like links. */
export function href(screen: Screen, params?: Record<string, string>): string {
  const query = new URLSearchParams(params).toString();
  return `#/${screen}${query ? `?${query}` : ''}`;
}
