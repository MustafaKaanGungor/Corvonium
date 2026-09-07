import { useState, type FormEvent } from 'react';
import {
  scheduleError,
  type Item,
  type ItemKind,
  type ItemStatus,
  type Project,
} from '@corvonium/shared';
import { fromDateTimeLocal, toDateTimeLocal } from '../../lib/format';

/** Satisfies both `NewItem` (title required) and `ItemEdit` (all optional). */
export type ItemDraft = {
  title: string;
  notes: string;
  kind: ItemKind;
  location: string | null;
  due: number | null;
  important: boolean;
  projectId: string | null;
  allDay: boolean;
  start: number | null;
  end: number | null;
  startDate: string | null;
  endDate: string | null;
};

/** How the schedule section is presented. The stored fields follow from it. */
type ScheduleMode = 'none' | 'allday' | 'timed';

function modeOf(item: Item | undefined): ScheduleMode {
  if (!item) return 'none';
  if (item.allDay) return 'allday';
  if (item.start !== null || item.end !== null) return 'timed';
  return 'none';
}

type Props = {
  initial?: Item;
  projects: Project[];
  onSubmit: (draft: ItemDraft) => void;
  /** Dismiss the sheet. Distinct from cancelling the *item*. */
  onClose: () => void;
  onSetStatus?: (status: ItemStatus) => void;
  onDelete?: () => void;
};

const field = 'w-full rounded-lg bg-[#1C241E] border border-[#28322B] px-3 py-2 text-[#E8EFE9]';
const label = 'block text-sm text-[#8A9990]';

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { key: T; label: string }[];
  onChange: (next: T) => void;
}) {
  return (
    <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          onClick={() => onChange(option.key)}
          aria-pressed={value === option.key}
          className={`rounded-lg border px-2 py-2 text-xs ${
            value === option.key
              ? 'border-[#4CC26A] bg-[#4CC26A] font-semibold text-[#06210F]'
              : 'border-[#28322B] bg-[#1C241E] text-[#8A9990]'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function ItemForm({ initial, projects, onSubmit, onClose, onSetStatus, onDelete }: Props) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [kind, setKind] = useState<ItemKind>(initial?.kind ?? 'task');
  const [location, setLocation] = useState(initial?.location ?? '');
  const [important, setImportant] = useState(initial?.important ?? false);
  const [projectId, setProjectId] = useState(initial?.projectId ?? '');
  const [due, setDue] = useState(initial?.due != null ? toDateTimeLocal(initial.due) : '');

  const [mode, setMode] = useState<ScheduleMode>(modeOf(initial));
  const [start, setStart] = useState(initial?.start != null ? toDateTimeLocal(initial.start) : '');
  const [end, setEnd] = useState(initial?.end != null ? toDateTimeLocal(initial.end) : '');
  const [startDate, setStartDate] = useState(initial?.startDate ?? '');
  const [endDate, setEndDate] = useState(initial?.endDate ?? '');

  // Only the fields the chosen mode owns reach the database. Switching modes
  // leaves stale values in the inputs, which is convenient if you switch back —
  // but they must not be saved.
  const schedule = {
    allDay: mode === 'allday',
    start: mode === 'timed' ? fromDateTimeLocal(start) : null,
    end: mode === 'timed' ? fromDateTimeLocal(end) : null,
    startDate: mode === 'allday' ? startDate || null : null,
    endDate: mode === 'allday' ? endDate || null : null,
  };

  const error = scheduleError(schedule);
  const canSave = title.trim().length > 0 && error === null;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSave) return;
    onSubmit({
      title: title.trim(),
      notes: notes.trim(),
      kind,
      location: location.trim() || null,
      due: fromDateTimeLocal(due),
      important,
      // The "No project" option is an empty string; the field wants null.
      projectId: projectId || null,
      ...schedule,
    });
  }

  const cancelled = initial?.status === 'cancelled';

  function confirmDelete() {
    if (!initial) return;
    const ok = window.confirm(
      `Delete "${initial.title}"?\n\nCancelling keeps it in your history instead.`,
    );
    if (ok) onDelete?.();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <input
        className={field}
        placeholder="What needs doing?"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        autoFocus
      />

      <Segmented
        value={kind}
        onChange={setKind}
        options={[
          { key: 'task', label: 'Task' },
          { key: 'event', label: 'Event' },
        ]}
      />

      <textarea
        className={field}
        placeholder="Notes"
        rows={2}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />

      <div className="space-y-2 rounded-lg border border-[#28322B] p-3">
        <span className="text-xs tracking-[0.12em] text-[#5F6E66] uppercase">Schedule</span>
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { key: 'none', label: 'None' },
            { key: 'allday', label: 'All day' },
            { key: 'timed', label: 'Timed' },
          ]}
        />

        {mode === 'allday' && (
          <div className="grid grid-cols-2 gap-2">
            <label className={label}>
              From
              <input
                type="date"
                className={`${field} mt-1`}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </label>
            <label className={label}>
              To <span className="text-[#5F6E66]">(optional)</span>
              <input
                type="date"
                className={`${field} mt-1`}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </label>
          </div>
        )}

        {mode === 'timed' && (
          <div className="grid gap-2">
            <label className={label}>
              Starts
              <input
                type="datetime-local"
                className={`${field} mt-1`}
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </label>
            <label className={label}>
              Ends
              <input
                type="datetime-local"
                className={`${field} mt-1`}
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </label>
          </div>
        )}

        {error !== null && <p className="text-xs text-[#D9614F]">{error}</p>}
      </div>

      {/* Independent of the schedule: §2.1 allows a block *and* a deadline. */}
      <label className={label}>
        Due
        <input
          type="datetime-local"
          className={`${field} mt-1`}
          value={due}
          onChange={(e) => setDue(e.target.value)}
        />
      </label>

      <input
        className={field}
        placeholder="Location"
        value={location}
        onChange={(e) => setLocation(e.target.value)}
      />

      <label className="flex items-center gap-2 text-sm text-[#E8EFE9]">
        <input
          type="checkbox"
          checked={important}
          onChange={(e) => setImportant(e.target.checked)}
        />
        Important
      </label>

      <label className={label}>
        Project
        <select
          className={`${field} mt-1`}
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
        >
          <option value="">No project</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={!canSave}
          className="flex-1 rounded-lg bg-[#4CC26A] px-4 py-2 font-semibold text-[#06210F] disabled:opacity-40"
        >
          {initial ? 'Save' : 'Add'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg bg-[#1C241E] px-4 py-2 text-[#E8EFE9]"
        >
          Close
        </button>
      </div>

      {initial && (
        <div className="flex gap-2 border-t border-[#28322B] pt-3">
          <button
            type="button"
            onClick={() => onSetStatus?.(cancelled ? 'open' : 'cancelled')}
            className="flex-1 rounded-lg bg-[#1C241E] px-4 py-2 text-sm text-[#E0A040]"
          >
            {cancelled ? 'Reopen' : 'Cancel item'}
          </button>
          <button
            type="button"
            onClick={confirmDelete}
            className="flex-1 rounded-lg bg-[#D9614F]/15 px-4 py-2 text-sm text-[#D9614F]"
          >
            Delete
          </button>
        </div>
      )}
    </form>
  );
}
