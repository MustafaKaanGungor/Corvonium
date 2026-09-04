import { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
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

type SectionProps = {
  group: Group;
  now: number;
  projects: Project[];
  dimmed: boolean;
  /** Insert position to mark, or `null` for no line in this group. */
  markAt: number | null;
  onOpen: (item: Item) => void;
};

function GroupSection({ group, now, projects, dimmed, markAt, onOpen }: SectionProps) {
  // The section itself is a drop target, which is what lets an *empty* group
  // receive an item — a SortableContext with no rows has nothing to hit.
  const { setNodeRef, isOver } = useDroppable({ id: group.key, disabled: dimmed });

  const rows = group.items.map((item) => (
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
    <section className={dimmed ? 'pointer-events-none opacity-30' : ''}>
      <h2 className="mb-2 text-[10px] font-bold tracking-[0.14em] text-[#5F6E66] uppercase">
        {group.label}
      </h2>

      <SortableContext
        id={group.key}
        items={group.items.map((i) => i.id)}
        strategy={verticalListSortingStrategy}
      >
        <ul
          ref={setNodeRef}
          className={`min-h-9 space-y-1.5 rounded-lg transition-colors ${
            isOver ? 'bg-[#4CC26A]/5 ring-1 ring-[#2A6B41]' : ''
          }`}
        >
          {rows.length === 0 ? (
            <li className="px-1 py-2 text-xs text-[#3D4A42]">Nothing here</li>
          ) : (
            rows
          )}
        </ul>
      </SortableContext>
    </section>
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

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={clearDrag}
    >
      <div className="space-y-5">
        {groups.map((group) => {
          const holdsDragged = dragging !== null && group.items.some((i) => i.id === dragging.id);

          return (
            <GroupSection
              key={group.key}
              group={group}
              now={now}
              projects={projects}
              dimmed={allowed !== null && !allowed.includes(group.key)}
              // Inside the group it came from, dnd-kit already shifts the rows
              // apart, so a line there would be a second, competing signal.
              markAt={drop?.group === group.key && !holdsDragged ? drop.index : null}
              onOpen={onOpen}
            />
          );
        })}
      </div>

      <DragOverlay>
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
