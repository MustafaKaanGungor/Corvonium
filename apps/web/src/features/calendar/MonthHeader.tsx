import type { Project } from '@corvonium/shared';
import { ProjectFilter } from '../tasks/ProjectFilter';

export type CalendarMode = 'plan' | 'effort';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** A decade either side is enough to jump anywhere without a date picker. */
function years(month: string): number[] {
  const current = Number(month.slice(0, 4));
  return Array.from({ length: 21 }, (_, i) => current - 10 + i);
}

const icon =
  'grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-[#28322B] text-[#8A9990]';

type Props = {
  month: string;
  mode: CalendarMode;
  projects: Project[];
  projectFilter: string | null;
  onMonth: (next: string) => void;
  onStep: (offset: number) => void;
  onToday: () => void;
  onMode: (next: CalendarMode) => void;
  onProjectFilter: (next: string | null) => void;
};

/**
 * Month picker, navigation and the Plan/Effort toggle on one line, with the
 * project chips beneath — the layout §3.2 specifies and the same chip row Task
 * view uses.
 *
 * That second row costs the grid about 32px. §3.2 notes it is now the reason a
 * phone cell fits exactly three bricks, so anything else added here breaks the
 * overflow ceiling.
 */
export function MonthHeader({
  month,
  mode,
  projects,
  projectFilter,
  onMonth,
  onStep,
  onToday,
  onMode,
  onProjectFilter,
}: Props) {
  const [year, monthIndex] = [month.slice(0, 4), Number(month.slice(5)) - 1];

  function setPart(part: 'year' | 'month', value: string) {
    const y = part === 'year' ? value : year;
    const m = part === 'month' ? Number(value) + 1 : monthIndex + 1;
    onMonth(`${y}-${String(m).padStart(2, '0')}`);
  }

  return (
    <header className="shrink-0 space-y-2 px-4 pt-4 pb-2">
      <div className="flex items-center gap-2">
        {/* The picker is the heading — tapping the month is how you jump. */}
        <select
          aria-label="Month"
          value={monthIndex}
          onChange={(e) => setPart('month', e.target.value)}
          className="rounded-lg bg-transparent py-1 text-[17px] font-bold tracking-tight text-[#E8EFE9]"
        >
          {MONTHS.map((name, i) => (
            <option key={name} value={i}>
              {name}
            </option>
          ))}
        </select>

        <select
          aria-label="Year"
          value={year}
          onChange={(e) => setPart('year', e.target.value)}
          className="rounded-lg bg-transparent py-1 text-[17px] font-bold tracking-tight text-[#E8EFE9]"
        >
          {years(month).map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>

        <button onClick={() => onStep(-1)} aria-label="Previous month" className={icon}>
          ‹
        </button>
        <button onClick={() => onStep(1)} aria-label="Next month" className={icon}>
          ›
        </button>
        <button
          onClick={onToday}
          className="rounded-lg border border-[#28322B] px-2.5 py-1 text-[11.5px] text-[#8A9990]"
        >
          Today
        </button>

        <div className="ml-auto flex shrink-0 gap-1 rounded-lg border border-[#28322B] p-0.5">
          {(['plan', 'effort'] as const).map((key) => (
            <button
              key={key}
              onClick={() => onMode(key)}
              aria-pressed={mode === key}
              className={`rounded-[6px] px-3 py-1 text-[11.5px] capitalize ${
                mode === key ? 'bg-[#4CC26A] font-semibold text-[#06210F]' : 'text-[#8A9990]'
              }`}
            >
              {key}
            </button>
          ))}
        </div>
      </div>

      <ProjectFilter projects={projects} value={projectFilter} onChange={onProjectFilter} />
    </header>
  );
}
