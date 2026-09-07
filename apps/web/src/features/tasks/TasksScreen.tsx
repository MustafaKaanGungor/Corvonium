import { useState } from 'react';
import type { Item, Project, TimeFilter } from '@corvonium/shared';
import { FilterRow } from './FilterRow';
import { ProjectFilter } from './ProjectFilter';
import { TaskView } from './TaskView';

const TIME_FILTERS: TimeFilter[] = ['all', 'missed', 'this-week', 'done'];

function readFilter(params: URLSearchParams): TimeFilter {
  const value = params.get('filter');
  return TIME_FILTERS.find((f) => f === value) ?? 'all';
}

type Props = {
  items: Item[];
  projects: Project[];
  now: number;
  params: URLSearchParams;
  onOpen: (item: Item) => void;
};

export function TasksScreen({ items, projects, now, params, onOpen }: Props) {
  // Seeded from the URL so Today's "See all" arrives pre-filtered, then owned
  // locally — per §3.1 view state is in-memory and resets on a cold start.
  const [filter, setFilter] = useState<TimeFilter>(() => readFilter(params));
  const [projectFilter, setProjectFilter] = useState<string | null>(null);

  // Self-healing: if the filtered project is deleted, fall back to "all" rather
  // than filtering by an id that no longer matches anything.
  const activeProject =
    projectFilter && projects.some((p) => p.id === projectFilter) ? projectFilter : null;

  return (
    <div className="mx-auto flex h-full max-w-[1180px] flex-col">
      {/* Stacked on a phone; one control strip beside the heading on desktop. */}
      <header className="shrink-0 space-y-2 px-5 pt-5 pb-3 md:flex md:items-center md:gap-4 md:space-y-0">
        <div className="md:shrink-0">
          <h1 className="text-xl font-bold tracking-tight md:text-[17px]">Tasks</h1>
          <p className="text-xs text-[#8A9990] md:hidden">
            {items.filter((i) => i.status === 'open').length} open
          </p>
        </div>

        <FilterRow value={filter} onChange={setFilter} />

        <div className="md:ml-auto md:min-w-0">
          <ProjectFilter projects={projects} value={activeProject} onChange={setProjectFilter} />
        </div>
      </header>

      {/*
        The phone scrolls the whole column. The matrix does not scroll at all —
        each quadrant scrolls inside itself, which is what holds the axis labels
        still. Hence overflow-hidden here and min-h-0 down the chain.
      */}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 md:overflow-hidden md:pb-4">
        <TaskView
          items={items}
          projects={projects}
          now={now}
          filter={filter}
          projectFilter={activeProject}
          onOpen={onOpen}
        />
      </div>
    </div>
  );
}
