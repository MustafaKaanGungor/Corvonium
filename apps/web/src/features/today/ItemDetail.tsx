import type { ReactNode } from 'react';
import { effectiveDue, isMissed, type Item, type Project } from '@corvonium/shared';
import { formatDate, formatRelativeDay, formatTime } from '../../lib/format';

/**
 * One item, read-only, for the detail column beside wide Today.
 *
 * This is the prototype's `.colside`. It is deliberately not a form: editing goes
 * through `ItemForm` in the side panel, so there is one place that writes an item
 * and one place that describes one.
 */

/** A `.meta` row — dim key, value, hairline under. */
function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 border-b border-[#28322B] py-2.5 text-[12.5px]">
      <span className="w-[68px] shrink-0 text-[11.5px] text-[#8A9990]">{label}</span>
      <span className="flex min-w-0 items-center gap-2">{children}</span>
    </div>
  );
}

type Props = {
  item: Item | null;
  now: number;
  project?: Project;
  onEdit: () => void;
};

export function ItemDetail({ item, now, project, onEdit }: Props) {
  if (item === null) {
    return (
      <div className="grid h-full place-items-center p-5 text-center">
        <p className="max-w-[24ch] text-sm text-[#5F6E66]">
          Pick something from the list to see it here.
        </p>
      </div>
    );
  }

  const missed = isMissed(item, now);
  const due = effectiveDue(item);
  const resolved = item.status !== 'open';

  // The panel has room to say when something *happens* as well as when it is due,
  // which the one-line row does not. An event gets its block; everything else gets
  // its deadline.
  const when =
    item.start !== null
      ? `${formatDate(item.start)} · ${formatTime(item.start)}${
          item.end === null ? '' : `–${formatTime(item.end)}`
        }`
      : due === null
        ? null
        : `${formatDate(due)}${item.allDay ? '' : ` · ${formatTime(due)}`}`;

  const status = resolved
    ? item.status === 'done'
      ? 'Done'
      : 'Cancelled'
    : missed && due !== null
      ? `Missed · ${formatRelativeDay(due, now)}`
      : item.kind === 'event'
        ? 'Event'
        : 'Open';

  return (
    <div className="flex h-full flex-col p-5">
      <p className="text-sm font-semibold">{item.title}</p>
      <p className={`mt-0.5 mb-3 text-[11.5px] ${missed ? 'text-[#D9614F]' : 'text-[#8A9990]'}`}>
        {status}
      </p>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <Meta label={item.start !== null ? 'When' : 'Due'}>
          {when === null ? (
            <span className="text-[#5F6E66]">Not scheduled</span>
          ) : (
            <span className={missed ? 'text-[#D9614F]' : undefined}>{when}</span>
          )}
        </Meta>

        <Meta label="Project">
          {project ? (
            <>
              <span
                className="h-[7px] w-[7px] shrink-0 rounded-full"
                style={{ background: project.color }}
              />
              <span className="truncate">{project.name}</span>
            </>
          ) : (
            <span className="text-[#5F6E66]">None</span>
          )}
        </Meta>

        {/* `rrule` is always null until block 5 builds recurrence. */}
        <Meta label="Repeat">
          <span className="text-[#5F6E66]">
            {item.rrule === null ? 'Does not repeat' : item.rrule}
          </span>
        </Meta>

        <Meta label="Important">
          {item.important ? (
            <span className="text-[#4CC26A]">Yes</span>
          ) : (
            <span className="text-[#5F6E66]">No</span>
          )}
        </Meta>

        {item.location !== null && item.location !== '' && (
          <Meta label="Location">
            <span className="truncate">{item.location}</span>
          </Meta>
        )}

        {item.notes !== '' && (
          <p className="mt-3 text-[12.5px] whitespace-pre-wrap text-[#8A9990]">{item.notes}</p>
        )}
      </div>

      {/*
        Both actions live at the foot of the column. `Start the Day` is a global
        action rather than one belonging to this item, but the prototype puts it
        here on desktop and it is the right place: it frees the list to run the
        full height of the screen.
      */}
      <div className="mt-4 grid shrink-0 gap-2">
        <button
          disabled
          className="rounded-xl bg-[#4CC26A] py-3 text-sm font-semibold text-[#06210F] disabled:opacity-30"
        >
          ▶ Start the Day
        </button>
        <button
          onClick={onEdit}
          className="rounded-xl border border-[#28322B] py-2.5 text-sm text-[#E8EFE9]"
        >
          Edit
        </button>
      </div>
    </div>
  );
}
