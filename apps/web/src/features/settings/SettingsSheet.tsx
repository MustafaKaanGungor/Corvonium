import { useState } from 'react';
import { countWrites, mergeWrites, type Project } from '@corvonium/shared';
import { applyMerge, applyReplace, readSnapshot } from '../../db/backup';
import { addProject, editProject, removeProject } from '../../db/projects';
import { exportBackup, lastExportAt, prepareImport, type ImportReviewData } from './backupActions';
import { DataSection, type Notice } from './DataSection';
import { ImportReview } from './ImportReview';
import { InstallSection } from './InstallSection';

function rename(project: Project) {
  const next = window.prompt('Rename project', project.name)?.trim();
  if (next && next !== project.name) editProject(project.id, { name: next });
}

function confirmRemove(project: Project) {
  const ok = window.confirm(
    `Delete the project "${project.name}"?\n\nIts items are kept — they just lose the tag.`,
  );
  if (ok) removeProject(project.id);
}

const failure = (err: unknown) =>
  `Something went wrong: ${err instanceof Error ? err.message : String(err)}`;

/**
 * Settings, minimally — plan §3.1 puts a gear in the Today header.
 * Projects, backups and this device; planning, capture and sync follow.
 */
export function SettingsSheet({
  projects,
  now,
  onClose,
}: {
  projects: Project[];
  now: number;
  onClose: () => void;
}) {
  const [name, setName] = useState('');

  const [review, setReview] = useState<ImportReviewData | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [lastExport, setLastExport] = useState(lastExportAt);

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    addProject(trimmed);
    setName('');
  }

  /** Runs one backup step with the buttons locked, reporting a thrown error in place. */
  async function run(step: () => Promise<void>) {
    setBusy(true);
    try {
      await step();
    } catch (err) {
      console.error('[corvonium] backup step failed', err);
      setReview(null);
      setNotice({ tone: 'error', text: failure(err) });
    } finally {
      setBusy(false);
    }
  }

  const exportNow = () =>
    run(async () => {
      if ((await exportBackup(now)) === 'saved') setLastExport(lastExportAt());
    });

  const importFile = (file: File) =>
    run(async () => {
      setNotice(null);
      const prepared = await prepareImport(file);
      if (prepared.ok) setReview(prepared.review);
      else setNotice({ tone: 'error', text: prepared.reason });
    });

  if (review !== null) {
    return (
      <ImportReview
        comparison={review.comparison}
        exportedAt={review.backup.exportedAt}
        busy={busy}
        onExportFirst={exportNow}
        onCancel={() => setReview(null)}
        onMerge={() =>
          run(async () => {
            // Read again: the device may have changed while the review was open.
            const device = await readSnapshot();
            const writes = mergeWrites(device, review.backup.data);
            await applyMerge(writes);
            const { added, updated } = countWrites(device, writes);
            setReview(null);
            setNotice({ tone: 'ok', text: `Merged: ${added} added, ${updated} updated.` });
          })
        }
        onReplace={() =>
          run(async () => {
            await applyReplace(review.backup.data, await readSnapshot());
            setReview(null);
            setNotice({ tone: 'ok', text: 'Replaced: this device now matches the backup.' });
          })
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Settings</h2>

      <section className="space-y-2">
        <h3 className="text-[10px] font-bold tracking-[0.14em] text-[#5F6E66] uppercase">
          Projects
        </h3>

        <div className="flex gap-2">
          <input
            className="min-w-0 flex-1 rounded-lg border border-[#28322B] bg-[#1C241E] px-3 py-2 text-sm"
            placeholder="New project"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
          <button onClick={submit} className="rounded-lg bg-[#1C241E] px-3 py-2 text-sm">
            Add
          </button>
        </div>

        {projects.length === 0 ? (
          <p className="text-xs text-[#5F6E66]">No projects yet.</p>
        ) : (
          <ul className="space-y-1">
            {projects.map((project) => (
              <li
                key={project.id}
                className="flex items-center gap-3 rounded-lg bg-[#1C241E] px-3 py-2 text-sm"
              >
                <span
                  className="h-[9px] w-[9px] shrink-0 rounded-full"
                  style={{ background: project.color }}
                />
                <span className="min-w-0 flex-1 truncate">{project.name}</span>
                <button onClick={() => rename(project)} className="shrink-0 text-xs text-[#8A9990]">
                  Rename
                </button>
                <button
                  onClick={() => confirmRemove(project)}
                  className="shrink-0 text-xs text-[#D9614F]"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <DataSection
        now={now}
        lastExport={lastExport}
        busy={busy}
        notice={notice}
        onExport={() => void exportNow()}
        onImport={(file) => void importFile(file)}
      />

      <InstallSection />

      <button onClick={onClose} className="w-full rounded-lg bg-[#1C241E] px-4 py-2 text-[#E8EFE9]">
        Close
      </button>
    </div>
  );
}
