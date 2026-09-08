import { segmentDuration, type Item, type Segment } from '@corvonium/shared';
import { formatDuration } from '../../lib/format';

/** What a segment was spent on, or a dash. Items may have been deleted since. */
function names(segment: Segment, items: Item[]): string | null {
  if (segment.itemIds.length === 0) return null;
  const found = segment.itemIds
    .map((id) => items.find((item) => item.id === id)?.title)
    .filter((title): title is string => title !== undefined);
  return found.length === 0 ? null : found.join(' · ');
}

/**
 * The session's history, oldest first. One row per transition, so the list is a
 * literal record of what you did rather than a summary of it.
 */
export function SegmentList({
  segments,
  items,
  now,
}: {
  segments: Segment[];
  items: Item[];
  now: number;
}) {
  return (
    <ul className="space-y-0.5">
      {segments.map((segment, i) => {
        const live = segment.endedAt === null;
        const on = names(segment, items);

        return (
          <li
            // Segments are append-only and never reordered, so the start instant is
            // a stable identity; the index guards the impossible double-click case.
            key={`${segment.startedAt}-${i}`}
            className="flex items-center gap-2.5 border-b border-[#28322B] py-2 text-[12.5px] last:border-b-0"
          >
            <span
              className="h-[7px] w-[7px] shrink-0 rounded-full"
              style={{ background: segment.kind === 'work' ? '#4CC26A' : '#E0A040' }}
            />
            <div className="min-w-0 flex-1">
              <div className="capitalize">{segment.kind}</div>
              {on !== null && <div className="truncate text-[11px] text-[#8A9990]">{on}</div>}
            </div>
            {live && (
              <span className="shrink-0 rounded-full bg-[#4CC26A]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[#4CC26A]">
                live
              </span>
            )}
            <span className="shrink-0 tabular-nums text-[#8A9990]">
              {formatDuration(segmentDuration(segment, now))}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
