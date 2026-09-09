import { useState } from 'react';
import type { Project } from '@corvonium/shared';
import { addProject, editProject, removeProject } from '../../db/projects';
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

/**
 * Settings, minimally — plan §3.1 puts a gear in the Today header.
 * Only project management for now; planning, capture, sync and export follow.
 */
export function SettingsSheet({ projects, onClose }: { projects: Project[]; onClose: () => void }) {
  const [name, setName] = useState('');

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    addProject(trimmed);
    setName('');
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

      <InstallSection />

      <button onClick={onClose} className="w-full rounded-lg bg-[#1C241E] px-4 py-2 text-[#E8EFE9]">
        Close
      </button>
    </div>
  );
}
