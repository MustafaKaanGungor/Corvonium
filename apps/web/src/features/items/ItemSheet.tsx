import type { Project } from '@corvonium/shared';
import { Sheet } from '../../components/Sheet';
import { AddSheet } from './AddSheet';
import { ItemForm } from './ItemForm';
import { SeriesChoice } from './SeriesChoice';
import type { ItemSheetState } from './useItemSheet';

/**
 * The one sheet items are added and edited in. Which of its three faces shows is
 * decided entirely by `useItemSheet`; this only draws it.
 */
export function ItemSheet({
  sheet,
  projects,
  now,
}: {
  sheet: ItemSheetState;
  projects: Project[];
  now: number;
}) {
  const { editing, pending } = sheet;

  return (
    <Sheet open={sheet.open} onClose={sheet.close}>
      {sheet.open &&
        (pending !== null && editing !== null ? (
          <SeriesChoice
            occurrence={editing}
            verb={pending.verb}
            onCancel={sheet.dropPending}
            onChoose={sheet.applyScope}
          />
        ) : editing === null ? (
          /* Adding: a capture line above the same form — §3.7. */
          <AddSheet
            projects={projects}
            now={now}
            prefill={sheet.addPrefill}
            onSubmit={sheet.add}
            onClose={sheet.close}
          />
        ) : (
          <ItemForm
            key={editing.id}
            initial={editing}
            autoFocusTitle
            projects={projects}
            onSubmit={sheet.save}
            onClose={sheet.close}
            onSetStatus={sheet.setStatus}
            onDelete={sheet.remove}
          />
        ))}
    </Sheet>
  );
}
