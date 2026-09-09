import { useMemo, useState } from 'react';
import { capture, type ItemEdit, type Project } from '@corvonium/shared';
import { CaptureField } from './CaptureField';
import { ItemForm, type ItemDraft } from './ItemForm';

/**
 * Adding an item: a capture line above the ordinary form.
 *
 * §3.7: *"the fields below are the ordinary item form, pre-filled. Nothing about
 * capture is a separate path"* — so a parse you dislike is just a form you edit.
 *
 * This owns the sentence and the set of chips tapped off, which is why it exists
 * rather than the state going into `App`: that file already carries routing, the
 * editor, the series prompt and the update bar.
 */
export function AddSheet({
  projects,
  now,
  prefill,
  onSubmit,
  onClose,
}: {
  projects: Project[];
  now: number;
  /** What the caller already knows — the calendar's selected day, if any. */
  prefill?: ItemEdit;
  onSubmit: (draft: ItemDraft) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());

  const parsed = useMemo(
    () => capture(text, projects, now, dismissed),
    // `now` ticks every minute and would otherwise re-parse mid-sentence, moving
    // a relative date under the cursor. The minute you started typing is the one
    // that should resolve "tomorrow".
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [text, projects, dismissed],
  );

  /*
    Seeded from the capture line when there is one, and from whatever the caller
    passed otherwise — the calendar's day.
  */
  const seed: ItemEdit =
    text.trim() === '' ? (prefill ?? {}) : { ...prefill, ...parsed.fields, title: parsed.title };

  /*
    The form re-seeds when the parse *output* changes, not on every keystroke —
    otherwise typing into a field would be impossible. The consequence is worth
    knowing: edit the title below, then type more above, and the line above wins.
  */
  const formKey = JSON.stringify(seed);

  function dismiss(id: string) {
    setDismissed((current) => new Set([...current, id]));
  }

  return (
    <div className="space-y-3">
      <CaptureField
        text={text}
        matches={parsed.used}
        projectColour={(id) => projects.find((p) => p.id === id)?.color}
        onText={setText}
        onDismiss={dismiss}
      />

      <div className="border-t border-[#28322B] pt-3">
        <ItemForm
          key={formKey}
          prefill={seed}
          projects={projects}
          onSubmit={onSubmit}
          onClose={onClose}
        />
      </div>
    </div>
  );
}
