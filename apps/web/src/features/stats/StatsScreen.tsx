import { useState } from 'react';
import {
  aggregateTotals,
  dayKeysIn,
  dayTotals,
  itemTotals,
  monthRange,
  onlyProject,
  projectTotals,
  sessionsIn,
  type DayRange,
  type Item,
  type Project,
  type Session,
} from '@corvonium/shared';
import { formatSpan } from '../../lib/format';
import { ProjectFilter } from '../tasks/ProjectFilter';
import { BarRows, DayBars, FocusLine, Panel, type Bar } from './Charts';
import { RangeRow, rangeFor, type RangeMode } from './RangeRow';

/** How many rows the ranked panels show before they stop being a summary. */
const TOP = 6;

const UNPROJECTED = '#5F6E66';

function Tile({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-[#28322B] bg-[#141A16] px-3.5 py-3">
      <div className="text-[10px] tracking-[0.1em] text-[#5F6E66] uppercase">{label}</div>
      <div className="mt-1 text-[22px] font-semibold tabular-nums" style={{ color: tone }}>
        {value}
      </div>
    </div>
  );
}

type Props = {
  sessions: Session[];
  items: Item[];
  projects: Project[];
  now: number;
};

/**
 * Where the time went — §3.6.
 *
 * **Everything is computed from `sessions` on read.** No rollup tables, no
 * aggregate documents, no summarisation job: a few sessions a day is on the order
 * of a thousand documents a year, which is nothing to aggregate in memory, and a
 * rollup would be a second source of truth for numbers that are cheap to derive.
 */
export function StatsScreen({ sessions, items, projects, now }: Props) {
  const [mode, setMode] = useState<RangeMode>('week');
  const [custom, setCustom] = useState<DayRange>(() => monthRange(now));
  const [projectId, setProjectId] = useState<string | null>(null);

  // Self-healing, as elsewhere: a deleted project falls back to "all" rather than
  // filtering by an id that matches nothing.
  const project = projectId !== null && projects.some((p) => p.id === projectId) ? projectId : null;

  const range = rangeFor(mode, now, custom);
  const inRange = sessionsIn(sessions, range);

  /*
    A project filter cannot select *sessions* — one session usually spans several
    projects. It narrows to the work segments carrying an item of that project,
    and the consequence is that break time and focus % stop being answerable: a
    break belongs to no project. The tiles say so with a dash rather than showing
    a number that would mean nothing.
  */
  const scoped = project === null ? inRange : onlyProject(inRange, items, project);
  const totals = aggregateTotals(scoped, now);
  const byDay = dayTotals(scoped, now);

  const days = dayKeysIn(range).map((key) => ({ key, ms: byDay.get(key)?.work ?? 0 }));
  const worked = days.filter((d) => d.ms > 0);

  const focusPoints = dayKeysIn(range)
    .map((key) => ({ key, totals: byDay.get(key) }))
    .filter((d) => d.totals !== undefined && d.totals.total > 0)
    .map((d) => ({ key: d.key, focus: d.totals?.focus ?? 0 }));

  const colourOf = (id: string | null) => projects.find((p) => p.id === id)?.color ?? UNPROJECTED;

  const projectRows: Bar[] = [...projectTotals(scoped, items, now)]
    .map(([id, ms]) => ({
      key: id ?? 'none',
      label: projects.find((p) => p.id === id)?.name ?? 'No project',
      ms,
      color: colourOf(id),
    }))
    .toSorted((a, b) => b.ms - a.ms);

  const itemRows: Bar[] = [...itemTotals(scoped, now)]
    .map(([id, ms]) => ({ item: items.find((i) => i.id === id), ms }))
    .filter((row): row is { item: Item; ms: number } => row.item !== undefined)
    .toSorted((a, b) => b.ms - a.ms)
    .slice(0, TOP)
    .map(({ item, ms }) => ({
      key: item.id,
      label: item.title,
      ms,
      color: colourOf(item.projectId),
    }));

  const overlapNote =
    'A segment can carry several items, so these overlap and will not sum to the totals above.';

  return (
    <div className="mx-auto flex h-full max-w-[1180px] flex-col">
      <header className="shrink-0 space-y-2 px-5 pt-5 pb-3 md:flex md:items-center md:gap-4 md:space-y-0">
        <h1 className="text-xl font-bold tracking-tight md:shrink-0 md:text-[17px]">Stats</h1>

        <RangeRow mode={mode} custom={custom} onMode={setMode} onCustom={setCustom} />

        <div className="md:ml-auto md:min-w-0">
          <ProjectFilter projects={projects} value={project} onChange={setProjectId} />
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
        {sessions.length === 0 ? (
          <p className="py-8 text-sm text-[#5F6E66]">
            Nothing recorded yet. Start the day from Today and this fills in as you work.
          </p>
        ) : (
          <>
            <div className="mb-3.5 grid grid-cols-2 gap-2.5 md:grid-cols-4">
              <Tile label="Work" value={formatSpan(totals.work)} tone="#4CC26A" />
              <Tile
                label="Break"
                value={project === null ? formatSpan(totals.break) : '—'}
                tone={project === null ? '#E0A040' : '#5F6E66'}
              />
              <Tile
                label="Focus"
                value={project === null ? `${Math.round(totals.focus * 100)}%` : '—'}
                tone={project === null ? undefined : '#5F6E66'}
              />
              <Tile label="Days worked" value={String(worked.length)} />
            </div>

            {project !== null && (
              <p className="mb-3.5 text-[11.5px] text-[#5F6E66]">
                Break and focus are blank under a project filter: a break belongs to no project, so
                there is no honest number to show.
              </p>
            )}

            <div className="grid gap-3 md:grid-cols-2">
              <Panel title="By project">
                <BarRows rows={projectRows} empty="No work has been attributed to an item yet." />
              </Panel>

              <Panel title="Hours per day">
                <DayBars days={days} />
                <p className="mt-1.5 flex justify-between text-[10.5px] text-[#5F6E66]">
                  <span>{range.from}</span>
                  <span>{range.to}</span>
                </p>
              </Panel>

              {/* One row cannot overlap anything, so the caveat would only confuse. */}
              <Panel
                title="Biggest time sinks"
                note={itemRows.length > 1 ? overlapNote : undefined}
              >
                <BarRows
                  rows={itemRows}
                  empty="Attach an item to a work segment and it lands here."
                />
              </Panel>

              {/* Focus is work over work-plus-break, which a project filter removes. */}
              {project === null && (
                <Panel title="Focus over time">
                  <FocusLine points={focusPoints} />
                </Panel>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
