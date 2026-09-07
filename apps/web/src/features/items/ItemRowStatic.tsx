import { effectiveDue, isMissed, type Item, type Project } from '@corvonium/shared';
import { toggleDone } from '../../db/items';
import { formatDate, formatRelativeDay, formatTime } from '../../lib/format';

export type RowProps = {
  item: Item;
  now: number;
  project?: Project;
  onOpen: () => void;
};

export const ROW_SHELL = 'flex items-start gap-3 rounded-lg bg-[#141A16] px-3 py-2.5';

/**
 * The same shell, lifted and given a left accent. Used where a row is not just
 * clicked but *selected* — wide Today, where the row and the detail pane beside it
 * have to read as one thing.
 */
const ROW_SHELL_SELECTED =
  'flex items-start gap-3 rounded-lg bg-[#1C241E] px-3 py-2.5 shadow-[inset_2px_0_0_#4CC26A]';

/** A row's contents, with no drag wiring. Shared by every list that shows items. */
export function RowBody({ item, now, project, onOpen }: RowProps) {
  const done = item.status === 'done';
  const cancelled = item.status === 'cancelled';
  const resolved = done || cancelled;
  const missed = isMissed(item, now);

  // Read the deadline through `effectiveDue`, so an all-day item — which carries a
  // date rather than a `due` — still gets a sub-line instead of a blank row.
  const due = effectiveDue(item);

  function subline(): string | null {
    // §3.3 wants how late, in words. "3 days ago" beats a date you have to subtract.
    if (missed && due !== null) return `Missed · ${formatRelativeDay(due, now)}`;

    // A block says when it happens, not when it is due — and its *start* is the
    // part you need. Falling through to `effectiveDue` here would label an
    // event's end time as a deadline.
    if (item.start !== null) {
      const ends = item.end === null ? '' : `–${formatTime(item.end)}`;
      return `${formatDate(item.start)} · ${formatTime(item.start)}${ends}`;
    }

    if (due === null) return null;
    return `Due ${formatDate(due)}${item.allDay ? '' : ` · ${formatTime(due)}`}`;
  }

  const detail = subline();

  return (
    <>
      <button
        onClick={() => toggleDone(item)}
        aria-label={done ? 'Mark as not done' : 'Mark as done'}
        className={`mt-0.5 grid h-[19px] w-[19px] shrink-0 place-items-center rounded-full border-[1.5px] text-xs font-bold ${
          done ? 'border-[#4CC26A] bg-[#4CC26A] text-[#06210F]' : 'border-[#5F6E66]'
        }`}
      >
        {done ? '✓' : ''}
      </button>

      <button onClick={onOpen} className="min-w-0 flex-1 text-left">
        <div className={resolved ? 'text-[#5F6E66] line-through' : ''}>{item.title}</div>

        {cancelled ? (
          <div className="text-xs text-[#E0A040]">Cancelled</div>
        ) : (
          detail !== null && (
            <div className={`text-xs ${missed ? 'text-[#D9614F]' : 'text-[#8A9990]'}`}>
              {detail}
            </div>
          )
        )}
      </button>

      {project && (
        <span
          title={project.name}
          className="mt-2 h-[7px] w-[7px] shrink-0 rounded-full"
          style={{ background: project.color }}
        />
      )}
    </>
  );
}

/**
 * A row outside any `SortableContext` — used by Today, where there is no drag,
 * and by the drag overlay, which renders outside the context by design.
 */
export function ItemRowStatic({ selected = false, ...props }: RowProps & { selected?: boolean }) {
  return (
    <li className={selected ? ROW_SHELL_SELECTED : ROW_SHELL}>
      <RowBody {...props} />
    </li>
  );
}
