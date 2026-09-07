import { href, type Screen } from '../lib/router';

/** One list, two chromes — the bottom bar and the top bar must not drift apart. */
export const DESTINATIONS: { key: Screen; label: string; icon: string }[] = [
  { key: 'calendar', label: 'Calendar', icon: '▦' },
  { key: 'today', label: 'Today', icon: '◉' },
  { key: 'tasks', label: 'Tasks', icon: '☰' },
  { key: 'stats', label: 'Stats', icon: '◔' },
];

/** The phone shell. Replaced by `TopBar` above 768px — plan §3.8. */
export function NavBar({ current }: { current: Screen }) {
  return (
    <nav className="grid shrink-0 grid-cols-4 border-t border-[#28322B] bg-[#141A16] pt-2 pb-2 md:hidden">
      {DESTINATIONS.map(({ key, label, icon }) => (
        <a
          key={key}
          href={href(key)}
          aria-current={current === key ? 'page' : undefined}
          className={`grid justify-items-center gap-0.5 py-1 text-[10.5px] no-underline ${
            current === key ? 'text-[#4CC26A]' : 'text-[#5F6E66]'
          }`}
        >
          <span className="text-base leading-none opacity-85">{icon}</span>
          {label}
        </a>
      ))}
    </nav>
  );
}
