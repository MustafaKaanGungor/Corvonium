import { sessionTotals, type Session } from '@corvonium/shared';
import { formatDuration } from '../lib/format';
import { href, type Screen } from '../lib/router';
import { useSync } from '../db/sync';
import { describeSync, TONE_COLOUR } from '../features/settings/syncText';
import { DESTINATIONS } from './NavBar';

function SyncLabel({ now }: { now: number }) {
  const sync = useSync();
  const { tone, label } = sync.configured
    ? describeSync(sync.status, sync.lastSyncedAt, now)
    : { tone: 'idle' as const, label: 'Local only' };

  return (
    <span className="flex items-center gap-1.5 text-[11.5px] text-[#8A9990]">
      <span
        className="block h-[7px] w-[7px] rounded-full"
        style={{ background: TONE_COLOUR[tone] }}
      />
      {label}
    </span>
  );
}

type Props = {
  current: Screen;
  liveSession: Session | null;
  now: number;
  onAdd: () => void;
  onOpenSettings: () => void;
};

/**
 * The desktop shell — plan §3.8, drawn in `design/corvonium-desktop.html`.
 *
 * Carries the three global actions that live in per-screen chrome on a phone:
 * navigation, adding an item, and settings.
 */
export function TopBar({ current, liveSession, now, onAdd, onOpenSettings }: Props) {
  return (
    <header className="hidden h-13 shrink-0 items-center gap-6 border-b border-[#28322B] bg-[#141A16] px-[22px] md:flex">
      <span className="text-[15px] font-bold tracking-[-0.01em]">
        Corvo<span className="text-[#4CC26A]">nium</span>
      </span>

      <nav className="flex flex-1 gap-1">
        {DESTINATIONS.map(({ key, label }) => (
          <a
            key={key}
            href={href(key)}
            aria-current={current === key ? 'page' : undefined}
            className={`rounded-lg px-4 py-1.5 text-[13px] no-underline ${
              current === key
                ? 'bg-[#1C241E] font-semibold text-[#4CC26A]'
                : 'text-[#5F6E66] hover:text-[#E8EFE9]'
            }`}
          >
            {label}
          </a>
        ))}
      </nav>

      <div className="flex shrink-0 items-center gap-3">
        {/*
          A running session takes this slot: it is the one thing happening *now*,
          and Work Mode is not a tab you can navigate back to from the nav above.
          Otherwise where the data is: "Local only" until this device is connected,
          then the sync state — never a green tick that isn't true.
        */}
        {liveSession === null ? (
          <SyncLabel now={now} />
        ) : (
          <a
            href={href('work')}
            className="flex items-center gap-1.5 text-[11.5px] text-[#4CC26A] no-underline"
          >
            <span className="block h-[7px] w-[7px] rounded-full bg-[#4CC26A]" />
            Session running · {formatDuration(sessionTotals(liveSession, now).total)}
          </a>
        )}

        <button
          onClick={onAdd}
          className="rounded-lg bg-[#4CC26A] px-4 py-1.5 text-[12.5px] font-semibold text-[#06210F]"
        >
          + Add
        </button>

        <button
          onClick={onOpenSettings}
          aria-label="Settings"
          className="grid h-7 w-7 place-items-center rounded-[7px] border border-[#28322B] text-[13px] text-[#8A9990]"
        >
          ⚙
        </button>
      </div>
    </header>
  );
}
