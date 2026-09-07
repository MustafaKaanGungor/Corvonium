import { useState } from 'react';
import { todayGroup, type Item, type Project, type TodayGroup } from '@corvonium/shared';
import { ItemRowStatic } from '../items/ItemRowStatic';
import { href } from '../../lib/router';
import { useMediaQuery, WIDE } from '../../lib/useMediaQuery';
import { ItemDetail } from './ItemDetail';

/** Plan §3.3: a launchpad, not a backlog. Three rows a group, however far behind you are. */
const CAP = 3;

const GROUPS: { key: TodayGroup; label: string }[] = [
  { key: 'missed', label: 'Missed' },
  { key: 'events', label: 'Events' },
  { key: 'due-today', label: 'Due today' },
  { key: 'all-day', label: 'All day' },
  { key: 'anytime', label: 'Anytime' },
];

type Props = {
  items: Item[];
  projects: Project[];
  now: number;
  onOpen: (item: Item) => void;
  onOpenSettings: () => void;
};

export function TodayView({ items, projects, now, onOpen, onOpenSettings }: Props) {
  const wide = useMediaQuery(WIDE);

  // View state, in-memory and resetting on a cold start — §3.1. Only ever read
  // through `selected` below, never directly.
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const grouped = GROUPS.map(({ key, label }) => ({
    key,
    label,
    items: items.filter((item) => todayGroup(item, now) === key),
  })).filter((group) => group.items.length > 0);

  // Self-healing, the same shape as `TasksScreen`'s project filter: if the selected
  // item is completed, deleted or otherwise leaves Today, fall through to the first
  // visible row rather than leaving the pane blank. The cap is applied here too, so
  // the selection can only ever be something actually on screen.
  const visible = grouped.flatMap((group) => group.items.slice(0, CAP));
  const selected = visible.find((item) => item.id === selectedId) ?? visible[0] ?? null;

  const list =
    grouped.length === 0 ? (
      <p className="py-8 text-sm text-[#5F6E66]">
        Nothing for today. Anything you add without a date shows up here.
      </p>
    ) : (
      grouped.map(({ key, label, items: inGroup }) => (
        <section key={key} className="mb-4">
          <h2 className="mb-1.5 text-[10px] font-bold tracking-[0.13em] text-[#5F6E66] uppercase">
            {label}
          </h2>
          <ul className="space-y-1">
            {inGroup.slice(0, CAP).map((item) => (
              <ItemRowStatic
                key={item.id}
                item={item}
                now={now}
                project={projects.find((p) => p.id === item.projectId)}
                // With a detail column a click selects; without one it edits. The
                // extra step only exists where the result is already on screen.
                selected={wide && item.id === selected?.id}
                onOpen={() => (wide ? setSelectedId(item.id) : onOpen(item))}
              />
            ))}
          </ul>

          {inGroup.length > CAP &&
            (key === 'missed' ? (
              // Missed is the one group with an exact filter to land on.
              <a
                href={href('tasks', { filter: 'missed' })}
                className="mt-1 inline-block px-1 text-xs font-semibold text-[#4CC26A] no-underline"
              >
                See all {inGroup.length} →
              </a>
            ) : (
              <p className="mt-1 px-1 text-xs text-[#5F6E66]">+{inGroup.length - CAP} more</p>
            ))}
        </section>
      ))
    );

  return (
    <div className="mx-auto flex h-full max-w-[1180px] flex-col">
      <header className="flex shrink-0 items-center justify-between gap-3 px-5 pt-5 pb-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Today</h1>
          <p className="text-xs text-[#8A9990]">
            {new Date(now).toLocaleDateString('en-GB', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          </p>
        </div>
        <button
          onClick={onOpenSettings}
          aria-label="Settings"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-[#28322B] text-sm text-[#8A9990] md:hidden"
        >
          ⚙
        </button>
      </header>

      {wide ? (
        // List | detail. Each column scrolls inside itself so the page does not,
        // which is what lets the detail pane's buttons stay put.
        <div className="grid min-h-0 flex-1 grid-cols-[1fr_340px]">
          <div className="min-h-0 overflow-y-auto px-5 pb-5">{list}</div>
          <div className="min-h-0 overflow-hidden border-l border-[#28322B] bg-[#0F1411]">
            <ItemDetail
              item={selected}
              now={now}
              project={projects.find((p) => p.id === selected?.projectId)}
              onEdit={() => selected && onOpen(selected)}
            />
          </div>
        </div>
      ) : (
        <>
          {/* The list scrolls; the button below does not — §3.3. */}
          <div className="min-h-0 flex-1 overflow-y-auto px-5">{list}</div>

          <div className="shrink-0 px-5 pt-2 pb-3">
            <button
              disabled
              className="w-full rounded-xl bg-[#4CC26A] py-4 font-semibold text-[#06210F] disabled:opacity-30"
            >
              ▶ Start the Day
            </button>
            <p className="mt-1.5 text-center text-[11px] text-[#5F6E66]">
              Work Mode arrives in the next block.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
