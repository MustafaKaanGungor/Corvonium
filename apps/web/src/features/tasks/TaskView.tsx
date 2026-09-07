import { useMemo, useState, type ReactNode } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  type SortingStrategy,
} from '@dnd-kit/sortable';
import {
  dropTargets,
  matchesProjectFilter,
  matchesTimeFilter,
  matrixGroup,
  type Item,
  type MatrixGroup,
  type Project,
  type TimeFilter,
} from '@corvonium/shared';
import { moveItem } from '../../db/items';
import { DESKTOP, useMediaQuery } from '../../lib/useMediaQuery';
import { ItemRow, ItemRowOverlay } from '../items/ItemRow';

// Until settings exist. Plan §2.8: one global number, default 2.
const URGENT_WITHIN_DAYS = 2;

const GROUPS: { key: MatrixGroup; label: string }[] = [
  { key: 'routine', label: 'Routine' },
  { key: 'urgent-important', label: 'Urgent & important' },
  { key: 'important', label: 'Important, not urgent' },
  { key: 'urgent', label: 'Urgent, not important' },
  { key: 'neither', label: 'Neither' },
];

/** Fractional keys guarantee character-code order; locale collation does not. */
const bySortOrder = (a: Item, b: Item) =>
  a.sortOrder < b.sortOrder ? -1 : a.sortOrder > b.sortOrder ? 1 : 0;

type Group = { key: MatrixGroup; label: string; items: Item[] };
type Drop = { group: MatrixGroup; neighbours: Item[]; index: number };

/**
 * `closestCenter` picks the droppable whose *centre* is nearest, which in a 2×2
 * with gaps can be the quadrant diagonally opposite the pointer. `pointerWithin`
 * is exact; `rectIntersection` catches the case where the pointer is over a gap
 * and strictly inside nothing.
 */
const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length > 0 ? hits : rectIntersection(args);
};

/**
 * Where a drop would land, or `null` if it would be refused.
 * `overId` is either a row id or, for an empty group, the group's own id.
 */
function resolveDrop(
  overId: string,
  activeId: string,
  groups: Group[],
  item: Item,
  now: number,
): Drop | null {
  const target =
    groups.find((g) => g.key === overId) ??
    groups.find((g) => g.items.some((i) => i.id === overId));

  if (!target || !dropTargets(item, now, URGENT_WITHIN_DAYS).includes(target.key)) return null;

  const neighbours = target.items.filter((i) => i.id !== activeId);
  const overIndex = target.items.findIndex((i) => i.id === overId);

  return {
    group: target.key,
    neighbours,
    index: overIndex === -1 ? neighbours.length : overIndex,
  };
}

/** A 2px rule showing exactly where the item will be inserted. */
function DropLine() {
  return <li aria-hidden className="-my-0.5 h-0.5 rounded-full bg-[#4CC26A]" />;
}

type ListProps = {
  group: Group;
  now: number;
  projects: Project[];
  dimmed: boolean;
  markAt: number | null;
  onOpen: (item: Item) => void;
  strategy?: SortingStrategy;
  className?: string;
};

/**
 * Every piece of drag wiring lives here, so both layouts share one implementation
 * and neither can drift out of step with `resolveDrop`.
 */
function GroupList({
  group,
  now,
  projects,
  dimmed,
  markAt,
  onOpen,
  strategy = verticalListSortingStrategy,
  className = '',
}: ListProps) {
  // The list itself is a drop target, which is what lets an *empty* group receive
  // an item — a SortableContext with no rows has nothing to hit.
  const { setNodeRef, isOver } = useDroppable({ id: group.key, disabled: dimmed });

  const rows: ReactNode[] = group.items.map((item) => (
    <ItemRow
      key={item.id}
      item={item}
      now={now}
      project={projects.find((p) => p.id === item.projectId)}
      onOpen={() => onOpen(item)}
    />
  ));

  if (markAt !== null) rows.splice(markAt, 0, <DropLine key="drop-line" />);

  return (
    <SortableContext id={group.key} items={group.items.map((i) => i.id)} strategy={strategy}>
      <ul
        ref={setNodeRef}
        className={`space-y-1 rounded-lg transition-colors ${
          isOver ? 'bg-[#4CC26A]/5 ring-1 ring-[#2A6B41]' : ''
        } ${className}`}
      >
        {rows.length === 0 ? (
          <li className="px-1 py-1 text-[11px] text-[#33403A]">Nothing here</li>
        ) : (
          rows
        )}
      </ul>
    </SortableContext>
  );
}

/** The phone layout: five groups down a column, each header carrying the axis. */
function StackedGroup(props: ListProps) {
  return (
    <section className={props.dimmed ? 'pointer-events-none opacity-30' : ''}>
      <h2 className="mb-1.5 text-[10px] font-bold tracking-[0.13em] text-[#5F6E66] uppercase">
        {props.group.label}
      </h2>
      <GroupList {...props} className="min-h-7" />
    </section>
  );
}

/** A cell of the 2×2. `tint` marks the two quadrants the method cares about. */
function Quadrant({ tint, ...props }: ListProps & { tint?: 'hot' | 'key' }) {
  const border =
    tint === 'hot'
      ? 'border-[#D9614F]/45 bg-gradient-to-b from-[#D9614F]/[0.07] to-transparent'
      : tint === 'key'
        ? 'border-[#4CC26A]/40 bg-gradient-to-b from-[#4CC26A]/[0.06] to-transparent'
        : 'border-[#28322B]';

  return (
    <section
      className={`flex min-h-0 flex-col overflow-hidden rounded-xl border bg-[#141A16] p-3 ${border} ${
        props.dimmed ? 'pointer-events-none opacity-30' : ''
      }`}
    >
      <div className="mb-2 flex shrink-0 items-baseline gap-2">
        <h2 className="text-[12.5px] font-semibold">{props.group.label}</h2>
        <span className="text-[11px] text-[#5F6E66]">{props.group.items.length}</span>
      </div>
      {/* The matrix holds still; the quadrant scrolls under its label. */}
      <GroupList {...props} className="min-h-0 flex-1 overflow-y-auto" />
    </section>
  );
}

function AxisLabel({ children, vertical }: { children: ReactNode; vertical?: boolean }) {
  return (
    <div
      className="grid place-items-center text-[9.5px] font-bold tracking-[0.16em] text-[#5F6E66] uppercase"
      style={vertical ? { writingMode: 'vertical-rl', transform: 'rotate(180deg)' } : undefined}
    >
      {children}
    </div>
  );
}

type Props = {
  items: Item[];
  projects: Project[];
  now: number;
  filter: TimeFilter;
  projectFilter: string | null;
  onOpen: (item: Item) => void;
};

export function TaskView({ items, projects, now, filter, projectFilter, onOpen }: Props) {
  const isDesktop = useMediaQuery(DESKTOP);
  const [dragging, setDragging] = useState<Item | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);

  const sensors = useSensors(
    // A small distance, not a long-press: the handle sets `touch-action: none`,
    // so it is never competing with a scroll gesture.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const groups = useMemo<Group[]>(() => {
    // The two filter axes are independent and combine — plan §3.4.
    const visible = items
      .filter((i) => matchesTimeFilter(i, now, filter) && matchesProjectFilter(i, projectFilter))
      .toSorted(bySortOrder);

    return GROUPS.map(({ key, label }) => ({
      key,
      label,
      items: visible.filter((i) => matrixGroup(i, now, URGENT_WITHIN_DAYS) === key),
    }));
  }, [items, now, filter, projectFilter]);

  const byKey = (key: MatrixGroup) => groups.find((g) => g.key === key)!;

  // Computed once per drag: the groups this item could legally land in (§3.4).
  const allowed = useMemo(
    () => (dragging ? dropTargets(dragging, now, URGENT_WITHIN_DAYS) : null),
    [dragging, now],
  );

  function clearDrag() {
    setDragging(null);
    setDrop(null);
  }

  function handleDragStart(event: DragStartEvent) {
    setDragging(items.find((i) => i.id === event.active.id) ?? null);
    setDrop(null);
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!dragging || !over) {
      setDrop(null);
      return;
    }
    setDrop(resolveDrop(String(over.id), String(active.id), groups, dragging, now));
  }

  function handleDragEnd(event: DragEndEvent) {
    const item = dragging;
    clearDrag();

    const { active, over } = event;
    if (!item || !over) return;

    const target = resolveDrop(String(over.id), String(active.id), groups, item, now);
    if (!target) return;

    const currentGroup = matrixGroup(item, now, URGENT_WITHIN_DAYS);
    if (target.group === currentGroup) {
      const home = groups.find((g) => g.key === currentGroup);
      const from = home ? home.items.findIndex((i) => i.id === active.id) : -1;
      if (from === target.index) return; // dropped where it already was
    }

    moveItem(
      item,
      target.group,
      target.neighbours.map((i) => i.sortOrder),
      target.index,
    );
  }

  /** Shared props for one group, whichever layout is rendering it. */
  function propsFor(key: MatrixGroup): ListProps {
    const group = byKey(key);
    const holdsDragged = dragging !== null && group.items.some((i) => i.id === dragging.id);
    return {
      group,
      now,
      projects,
      onOpen,
      dimmed: allowed !== null && !allowed.includes(key),
      // Inside the group it came from, dnd-kit already shifts the rows apart, so
      // a line there would be a second, competing signal.
      markAt: drop?.group === key && !holdsDragged ? drop.index : null,
    };
  }

  const routine = byKey('routine');

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={clearDrag}
    >
      {isDesktop ? (
        <div className="flex h-full min-h-0 flex-col gap-2.5">
          {/* Vertical space is scarce here, and the four quadrants must always show. */}
          {routine.items.length > 0 && (
            <section
              className={`shrink-0 rounded-xl border border-[#28322B] bg-[#141A16] p-3 ${
                propsFor('routine').dimmed ? 'pointer-events-none opacity-30' : ''
              }`}
            >
              <h2 className="mb-2 text-[10px] font-bold tracking-[0.14em] text-[#5F6E66] uppercase">
                Routine · everything that recurs
              </h2>
              <GroupList
                {...propsFor('routine')}
                strategy={rectSortingStrategy}
                className="flex flex-wrap gap-2 space-y-0"
              />
            </section>
          )}

          <div className="grid min-h-0 flex-1 grid-cols-[26px_1fr_1fr] grid-rows-[22px_1fr_1fr] gap-2">
            <div />
            <AxisLabel>Urgent</AxisLabel>
            <AxisLabel>Not urgent</AxisLabel>

            <AxisLabel vertical>Important</AxisLabel>
            <Quadrant {...propsFor('urgent-important')} tint="hot" />
            <Quadrant {...propsFor('important')} tint="key" />

            <AxisLabel vertical>Not important</AxisLabel>
            <Quadrant {...propsFor('urgent')} />
            <Quadrant {...propsFor('neither')} />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {GROUPS.map(({ key }) => (
            <StackedGroup key={key} {...propsFor(key)} />
          ))}
        </div>
      )}

      {/*
        No drop animation. `handleDragEnd` clears `dragging` synchronously, so by the
        time dnd-kit measures the overlay for its flight back the child is already
        gone — and the fixed wrapper stays mounted at z-index 999, swallowing clicks.
        The row reappears in its new place through the RxDB subscription regardless,
        so the animation was buying nothing.
      */}
      <DragOverlay dropAnimation={null}>
        {dragging && (
          <ItemRowOverlay
            item={dragging}
            now={now}
            project={projects.find((p) => p.id === dragging.projectId)}
            onOpen={() => {}}
          />
        )}
      </DragOverlay>
    </DndContext>
  );
}
