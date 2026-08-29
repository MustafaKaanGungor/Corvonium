import type { TimeFilter } from '@corvonium/shared';

const FILTERS: { key: TimeFilter; label: string }[] = [
  { key: 'all', label: 'All time' },
  { key: 'missed', label: 'Missed' },
  { key: 'this-week', label: 'This week' },
  { key: 'done', label: 'Done' },
];

export function FilterRow({
  value,
  onChange,
}: {
  value: TimeFilter;
  onChange: (next: TimeFilter) => void;
}) {
  return (
    <div className="grid grid-cols-4 gap-1">
      {FILTERS.map(({ key, label }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={`rounded-lg border px-2 py-2 text-xs ${
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