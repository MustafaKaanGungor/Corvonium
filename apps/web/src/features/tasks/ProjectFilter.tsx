import type { ReactNode } from 'react';
import type { Project } from '@corvonium/shared';

type ChipProps = {
  active: boolean;
  color?: string;
  onClick: () => void;
  children: ReactNode;
};

function Chip({ active, color, onClick, children }: ChipProps) {
  return (
    <button
      onClick={onClick}
      className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs whitespace-nowrap ${
        active ? 'border-[#4CC26A] text-[#E8EFE9]' : 'border-[#28322B] text-[#8A9990]'
      }`}
    >
      {color && (
        <span className="h-[7px] w-[7px] rounded-full" style={{ background: color }} />
      )}
      {children}
    </button>
  );
}

type Props = {
  projects: Project[];
  /** `null` is every project — plan §3.4. */
  value: string | null;
  onChange: (next: string | null) => void;
};

export function ProjectFilter({ projects, value, onChange }: Props) {
  // With nothing to filter by, "All projects" on its own is just noise.
  if (projects.length === 0) return null;

  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1">
      <Chip active={value === null} onClick={() => onChange(null)}>
        All projects
      </Chip>
      {projects.map((project) => (
        <Chip
          key={project.id}
          active={value === project.id}
          color={project.color}
          onClick={() => onChange(project.id)}
        >
          {project.name}
        </Chip>
      ))}
    </div>
  );
}
