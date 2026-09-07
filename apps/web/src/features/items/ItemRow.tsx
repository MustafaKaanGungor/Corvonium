import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { RowBody, ROW_SHELL, type RowProps } from './ItemRowStatic';

/**
 * The floating copy under the cursor. Separate from `ItemRow` rather than a prop,
 * because `DragOverlay` renders outside any `SortableContext` and `useSortable`
 * has nothing to attach to there.
 */
export function ItemRowOverlay(props: RowProps) {
  return (
    <li className={`${ROW_SHELL} shadow-lg shadow-black/40 ring-1 ring-[#4CC26A]/40`}>
      <RowBody {...props} />
      <span className="mt-1 px-1 text-sm text-[#4CC26A]">⠿</span>
    </li>
  );
}

export function ItemRow(props: RowProps) {
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
      className={`${ROW_SHELL} ${isDragging ? 'opacity-40' : ''}`}
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
