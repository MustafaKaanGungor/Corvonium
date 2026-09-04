import { useState } from 'react';
import type { Item, TimeFilter } from '@corvonium/shared';
import { useItems, useProjects } from './db/hooks';
import { addItem, editItem, removeItem, setStatus } from './db/items';
import { addProject } from './db/projects';
import { useNow } from './lib/useNow';
import { formatDayLabel } from './lib/format';
import { Sheet } from './components/Sheet';
import { ItemForm } from './features/items/ItemForm';
import { FilterRow } from './features/tasks/FilterRow';
import { ProjectFilter } from './features/tasks/ProjectFilter';
import { TaskView } from './features/tasks/TaskView';

export default function App() {
  const { data: items, error: itemsError } = useItems();
  const { data: projects } = useProjects();
  const now = useNow();

  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [filter, setFilter] = useState<TimeFilter>('all');
  const [projectFilter, setProjectFilter] = useState<string | null>(null);
  const [newProject, setNewProject] = useState('');

  const sheetOpen = adding || editing !== null;

  // Self-healing: if the filtered project is deleted, fall back to "all"
  // rather than filtering by an id that no longer matches anything.
  const activeProject =
    projectFilter && projects?.some((p) => p.id === projectFilter) ? projectFilter : null;

  function close() {
    setAdding(false);
    setEditing(null);
  }

  function submitProject() {
    const name = newProject.trim();
    if (!name) return;
    addProject(name);
    setNewProject('');
  }

  return (
    <div className="min-h-dvh bg-[#0A0E0C] p-6 text-[#E8EFE9]">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">
          Corvo<span className="text-[#4CC26A]">nium</span>
        </h1>
        <p className="text-sm text-[#8A9990]">{formatDayLabel(now)}</p>
      </header>

      <button
        onClick={() => setAdding(true)}
        className="rounded-lg bg-[#4CC26A] px-4 py-2 font-semibold text-[#06210F]"
      >
        Add item
      </button>

      {/* Temporary. Projects move into Settings — plan §3.1. */}
      <section className="mt-4 rounded-lg border border-[#28322B] p-3">
        <div className="flex gap-2">
          <input
            className="min-w-0 flex-1 rounded-lg border border-[#28322B] bg-[#1C241E] px-3 py-2 text-sm"
            placeholder="New project"
            value={newProject}
            onChange={(e) => setNewProject(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitProject()}
          />
          <button onClick={submitProject} className="rounded-lg bg-[#1C241E] px-3 py-2 text-sm">
            Add
          </button>
        </div>

        {projects && projects.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2">
            {projects.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-2 rounded-full border border-[#28322B] px-3 py-1 text-xs text-[#8A9990]"
              >
                <span className="h-[7px] w-[7px] rounded-full" style={{ background: p.color }} />
                {p.name}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="my-4 space-y-2">
        <FilterRow value={filter} onChange={setFilter} />
        <ProjectFilter
          projects={projects ?? []}
          value={activeProject}
          onChange={setProjectFilter}
        />
      </div>

      {itemsError !== null ? (
        <p className="rounded-lg border border-[#D9614F]/40 bg-[#D9614F]/10 p-4 text-sm text-[#D9614F]">
          Could not open your data: {itemsError}
          <br />
          <span className="text-[#8A9990]">Your items are safe on this device. Try reloading.</span>
        </p>
      ) : items === null ? (
        <p className="p-4 text-sm text-[#5F6E66]">Loading&hellip;</p>
      ) : (
        <TaskView
          items={items}
          projects={projects ?? []}
          now={now}
          filter={filter}
          projectFilter={activeProject}
          onOpen={setEditing}
        />
      )}

      <Sheet open={sheetOpen} onClose={close}>
        {sheetOpen && (
          <ItemForm
            key={editing?.id ?? 'new'}
            initial={editing ?? undefined}
            projects={projects ?? []}
            onSubmit={(draft) => {
              if (editing) editItem(editing.id, draft);
              else addItem(draft);
              close();
            }}
            onClose={close}
            onSetStatus={(status) => {
              if (!editing) return;
              setStatus(editing.id, status);
              close();
            }}
            onDelete={() => {
              if (!editing) return;
              removeItem(editing.id);
              close();
            }}
          />
        )}
      </Sheet>
    </div>
  );
}
