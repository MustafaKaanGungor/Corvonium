import type { TimeFilter } from '@corvonium/shared';

const FILTERS: { key: TimeFilter; label: string }[] = [
  { key: 'all', label: 'All time' },
  { key: 'missed', label: 'Missed' },
  { key: 'this-week', label: 'This week' },
  { key: 'done', label: 'Done' },
];

/**
 * Four equal buttons on a phone, where they own the width; pills in a row on
 * desktop, where they sit beside the heading and the project chips as one strip.
 */
export function FilterRow({
  value,
  onChange,
}: {
  value: TimeFilter;
  onChange: (next: TimeFilter) => void;
}) {
  return (
    <div className="grid grid-cols-4 gap-1 md:flex md:gap-1.5">
      {FILTERS.map(({ key, label }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={`rounded-lg border px-2 py-2 text-xs whitespace-nowrap md:rounded-full md:px-3 md:py-1 md:text-[11.5px] ${
            value === key
              ? 'border-[#4CC26A] bg-[#4CC26A] font-semibold text-[#06210F]'
              : 'border-[#28322B] bg-[#141A16] text-[#8A9990]'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
