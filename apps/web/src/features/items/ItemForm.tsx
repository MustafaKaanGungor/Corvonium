import { useState, type FormEvent } from 'react';
import type { NewItem } from '@corvonium/shared';
import { fromDateTimeLocal } from '../../lib/format';

type Props = {
  onSubmit: (draft: NewItem) => void;
  onCancel: () => void;
};

const field = 'w-full rounded-lg bg-[#1C241E] border border-[#28322B] px-3 py-2 text-[#E8EFE9]';

export function ItemForm({ onSubmit, onCancel }: Props) {
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [due, setDue] = useState('');
  const [important, setImportant] = useState(false);

  const canSave = title.trim().length > 0;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSave) return;
    onSubmit({
      title: title.trim(),
      notes: notes.trim(),
      due: fromDateTimeLocal(due),
      important,
    });
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

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={!canSave}
          className="flex-1 rounded-lg bg-[#4CC26A] px-4 py-2 font-semibold text-[#06210F] disabled:opacity-40"
        >
          Add
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg bg-[#1C241E] px-4 py-2 text-[#E8EFE9]"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
