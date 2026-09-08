import {
  isMissed,
  itemSpan,
  layoutWeek,
  monthOf,
  overflow,
  weekDays,
  type Item,
  type Project,
  type SessionTotals,
} from '@corvonium/shared';
import { EffortCell } from './EffortCell';

/** Where the lane grid begins, leaving room for the day number above it. */
const LANES_TOP = 25;

type Props = {
  weekStart: string;
  month: string;
  today: string;
  selected: string;
  items: Item[];
  projects: Project[];
  mode: 'plan' | 'effort';
  effort: Map<string, SessionTotals>;
  now: number;
  maxLanes: number;
  onSelect: (day: string) => void;
  onOpenDay: (day: string) => void;
};

/**
 * One week of the month grid, drawn as **two layers** — the structure the
 * prototype settled on and the reason week-spanning works at all.
 *
 * Cells sit underneath as a plain seven-column grid; bricks sit above in their
 * *own* seven-column grid, positioned by `grid-column`. A bar covering Tuesday to
 * Thursday is one element spanning three columns rather than three elements
 * pretending to be one, so it cannot drift out of alignment with the days beneath.
 */
export function WeekRow({
  weekStart,
  month,
  today,
  selected,
  items,
  projects,
  mode,
  effort,
  now,
  maxLanes,
  onSelect,
  onOpenDay,
}: Props) {
  const days = weekDays(weekStart);
  const bricks = mode === 'plan' ? layoutWeek(items, weekStart) : [];

  /*
    `+N more` needs a row of its own, so a row that overflows shows one fewer
    brick. The cap is decided **per week row** rather than per cell: lanes are
    assigned across the whole row, and varying the cap cell by cell would hide a
    spanning bar on one of its days and not the others.
  */
  const spills = overflow(bricks, weekStart, maxLanes).size > 0;
  const cap = spills ? maxLanes - 1 : maxLanes;
  const hidden = overflow(bricks, weekStart, cap);

  return (
    <div className="relative min-h-0">
      <div className="absolute inset-0 grid grid-cols-7 gap-[3px]">
        {days.map((day) => {
          const outside = monthOf(day) !== month;
          const more = hidden.get(day) ?? 0;

          return (
            <button
              key={day}
              onClick={() => (day === selected ? onOpenDay(day) : onSelect(day))}
              className={`relative overflow-hidden rounded-[7px] pt-[5px] text-left ${
                outside ? 'bg-transparent' : 'bg-[#141A16]'
              } ${day === selected ? 'shadow-[inset_0_0_0_1.5px_#2E7D46]' : ''}`}
            >
              <span
                className={`block pl-[9px] text-[11.5px] tabular-nums ${
                  outside ? 'text-[#5F6E66]/40' : 'text-[#8A9990]'
                } ${
                  day === today
                    ? 'ml-[5px] h-5 w-5 rounded-full bg-[#4CC26A] pl-0 text-center leading-5 font-bold text-[#06210F]'
                    : ''
                }`}
              >
                {Number(day.slice(8))}
              </span>

              {mode === 'effort' && (
                <EffortCell totals={effort.get(day)} day={day} today={today} now={now} />
              )}

              {/*
                Drawn as a footer rather than as a lane, so it never competes with
                the bricks for row space and each cell counts only its own.
              */}
              {mode === 'plan' && more > 0 && (
                <span className="absolute right-[6px] bottom-[3px] text-[10px] font-semibold text-[#8A9990]">
                  +{more} more
                </span>
              )}
            </button>
          );
        })}
      </div>

      {mode === 'plan' && (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-[3px] grid grid-cols-7 gap-[2px]"
          style={{ top: LANES_TOP, gridAutoRows: '18px' }}
        >
          {bricks
            .filter((brick) => brick.lane <= cap)
            .map((brick) => {
              const { item } = brick;
              const project = projects.find((p) => p.id === item.projectId);
              const colour = project?.color ?? '#4CC26A';

              const resolved = item.status !== 'open';
              const missed = isMissed(item, now);
              // A bare deadline is an instant, not a stretch — drawn as an outline
              // marker so shape carries it and colour stays free for the project.
              const marker = !item.allDay && item.start === null && item.due !== null;

              return (
                <div
                  key={`${item.id}:${brick.colStart}`}
                  title={item.title}
                  style={{
                    gridColumn: `${brick.colStart} / ${brick.colEnd}`,
                    gridRow: brick.lane,
                    background: marker ? 'transparent' : colour,
                    color: marker ? colour : '#07120C',
                    boxShadow: marker ? `inset 0 0 0 1px ${colour}` : undefined,
                    borderTopLeftRadius: brick.continuesLeft ? 0 : undefined,
                    borderBottomLeftRadius: brick.continuesLeft ? 0 : undefined,
                    borderTopRightRadius: brick.continuesRight ? 0 : undefined,
                    borderBottomRightRadius: brick.continuesRight ? 0 : undefined,
                    marginLeft: brick.continuesLeft ? 0 : 2,
                    marginRight: brick.continuesRight ? 0 : 2,
                  }}
                  className={`h-4 truncate rounded px-[7px] text-[10.5px] leading-4 font-semibold ${
                    resolved ? 'line-through opacity-35' : ''
                  } ${missed && !resolved ? 'ring-1 ring-[#D9614F]' : ''}`}
                >
                  {brick.continuesLeft ? '‹ ' : ''}
                  {item.title}
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}

/** Whether an item belongs on the grid at all — unscheduled ones never do. */
export function isDrawable(item: Item): boolean {
  return itemSpan(item) !== null;
}
