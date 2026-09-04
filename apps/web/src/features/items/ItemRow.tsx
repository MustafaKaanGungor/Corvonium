import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { isMissed, type Item, type Project } from '@corvonium/shared';
import { toggleDone } from '../../db/items';
import { formatDate, formatTime } from '../../lib/format';

type Props = {
  item: Item;
  now: number;
  project?: Project;
  onOpen: () => void;
};

/** The row's contents, shared by the sortable row and the drag overlay. */
function RowBody({ item, now, project, onOpen }: Props) {
  const done = item.status === 'done';
  const cancelled = item.status === 'cancelled';
  const resolved = done || cancelled;
  const missed = isMissed(item, now);

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
          item.due !== null && (
            <div className={`text-xs ${missed ? 'text-[#D9614F]' : 'text-[#8A9990]'}`}>
              {missed ? 'Missed · ' : 'Due '}
              {formatDate(item.due)} · {formatTime(item.due)}
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

const SHELL = 'flex items-start gap-3 rounded-lg bg-[#141A16] px-3 py-2.5';

/**
 * The floating copy under the cursor. A separate component rather than a prop,
 * because `DragOverlay` renders outside any `SortableContext` and `useSortable`
 * has nothing to attach to there.
 */
export function ItemRowOverlay(props: Props) {
  return (
    <li className={`${SHELL} shadow-lg shadow-black/40 ring-1 ring-[#4CC26A]/40`}>
      <RowBody {...props} />
      <span className="mt-1 px-1 text-sm text-[#4CC26A]">⠿</span>
    </li>
  );
}

export function ItemRow(props: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.item.id });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`${SHELL} ${isDragging ? 'opacity-40' : ''}`}
    >
      <RowBody {...props} />

      <button
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${props.item.title}`}
        // touch-action: none, or the browser claims the gesture for scrolling
        // before dnd-kit ever sees it.
        className="mt-1 shrink-0 cursor-grab touch-none px-1 text-sm text-[#5F6E66] active:cursor-grabbing"
      >
        ⠿
      </button>
    </li>
  );
}
