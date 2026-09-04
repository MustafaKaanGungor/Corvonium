import { useState, type FormEvent } from 'react';
import type { Item, ItemStatus, Project } from '@corvonium/shared';
import { fromDateTimeLocal, toDateTimeLocal } from '../../lib/format';

export type ItemDraft = {
  title: string;
  notes: string;
  due: number | null;
  important: boolean;
  projectId: string | null;
};

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

export function ItemForm({ initial, projects, onSubmit, onClose, onSetStatus, onDelete }: Props) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [due, setDue] = useState(initial?.due != null ? toDateTimeLocal(initial.due) : '');
  const [important, setImportant] = useState(initial?.important ?? false);
  const [projectId, setProjectId] = useState(initial?.projectId ?? '');

  const canSave = title.trim().length > 0;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSave) return;
    onSubmit({
      title: title.trim(),
      notes: notes.trim(),
      due: fromDateTimeLocal(due),
      important,
      // The "No project" option is an empty string; the field wants null.
      projectId: projectId || null,
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
    <form onSubmit={handleSubmit} className="space-y-3 rounded-xl bg-[#141A16] p-4">
      <input
        className={field}
        placeholder="What needs doing?"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        autoFocus
      />

      <textarea
        className={field}
        placeholder="Notes"
        rows={2}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />

      <label className="block text-sm text-[#8A9990]">
        Due
        <input
          type="datetime-local"
          className={`${field} mt-1`}
          value={due}
          onChange={(e) => setDue(e.target.value)}
        />
      </label>

      <label className="flex items-center gap-2 text-sm text-[#E8EFE9]">
        <input
          type="checkbox"
          checked={important}
          onChange={(e) => setImportant(e.target.checked)}
        />
        Important
      </label>

      <label className="block text-sm text-[#8A9990]">
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
