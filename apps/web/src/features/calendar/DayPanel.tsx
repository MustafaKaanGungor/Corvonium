import {
  aggregateTotals,
  itemsOn,
  localDayKey,
  segmentDuration,
  type Item,
  type Project,
  type Session,
} from '@corvonium/shared';
import { formatDuration, formatSpan } from '../../lib/format';
import { ItemRowStatic } from '../items/ItemRowStatic';
import type { CalendarMode } from './MonthHeader';

/**
 * One day in full.
 *
 * §3.2 makes this carry more weight than it looks: month is the only calendar
 * layout, so this is the *only* place a day's items are seen complete, and it has
 * to work as the de facto day view. It is also where `+N more` lands.
 *
 * In Effort mode it answers the other question the grid is asking — not what was
 * planned but what actually happened.
 */
export function DayPanel({
  day,
  mode,
  items,
  sessions,
  projects,
  now,
  onOpen,
  onClose,
}: {
  day: string;
  mode: CalendarMode;
  items: Item[];
  sessions: Session[];
  projects: Project[];
  now: number;
  onOpen: (item: Item) => void;
  onClose: () => void;
}) {
  const heading = new Date(`${day}T12:00`).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  const onDay = itemsOn(items, day);
  const ofDay = sessions.filter((s) => localDayKey(s.startedAt) === day);
  const totals = aggregateTotals(ofDay, now);

  return (
    <div className="flex max-h-[70vh] flex-col md:max-h-none">
      {/*
        A visible way out, as the prototype's `.closex`. Clicking outside works
        too, but a panel with no button on it looks like it has no exit.
      */}
      <div className="flex shrink-0 items-start justify-between gap-3">
        <p className="text-sm font-semibold">{heading}</p>
        <button
          onClick={onClose}
          aria-label="Close"
          className="-mt-1 -mr-1 shrink-0 rounded-lg px-2 py-1 text-[15px] text-[#5F6E66]"
        >
          ✕
        </button>
      </div>
      <p className="mt-0.5 mb-3 shrink-0 text-[11.5px] text-[#8A9990]">
        {mode === 'plan'
          ? `${onDay.length} item${onDay.length === 1 ? '' : 's'}`
          : `${formatSpan(totals.work)} worked · ${ofDay.length} session${
              ofDay.length === 1 ? '' : 's'
            }`}
      </p>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {mode === 'plan' ? (
          onDay.length === 0 ? (
            <p className="py-6 text-sm text-[#5F6E66]">Nothing on this day.</p>
          ) : (
            <ul className="space-y-1">
              {onDay.map((item) => (
                <ItemRowStatic
                  key={item.id}
                  item={item}
                  now={now}
                  project={projects.find((p) => p.id === item.projectId)}
                  onOpen={() => onOpen(item)}
                />
              ))}
            </ul>
          )
        ) : ofDay.length === 0 ? (
          <p className="py-6 text-sm text-[#5F6E66]">No work recorded on this day.</p>
        ) : (
          <ul className="space-y-3">
            {ofDay.map((session) => (
              <li key={session.id} className="rounded-lg bg-[#141A16] px-3 py-2.5">
                <div className="flex items-baseline justify-between text-[12.5px]">
                  <span>
                    {new Date(session.startedAt).toLocaleTimeString('en-GB', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  <span className="tabular-nums text-[#8A9990]">
                    {formatDuration(
                      session.segments.reduce((sum, s) => sum + segmentDuration(s, now), 0),
                    )}
                  </span>
                </div>
                <div className="mt-1.5 flex gap-0.5">
                  {/* The session's shape, at a glance: work green, break amber. */}
                  {session.segments.map((segment, i) => (
                    <span
                      key={`${segment.startedAt}-${i}`}
                      title={`${segment.kind} · ${formatDuration(segmentDuration(segment, now))}`}
                      className="h-[5px] rounded-full"
                      style={{
                        flexGrow: Math.max(1, segmentDuration(segment, now)),
                        background: segment.kind === 'work' ? '#4CC26A' : '#E0A040',
                      }}
                    />
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
