import { monthRange, weekRange, type DayRange } from '@corvonium/shared';

export type RangeMode = 'week' | 'month' | 'custom';

const MODES: { key: RangeMode; label: string }[] = [
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'custom', label: 'Custom' },
];

/** The range a mode means right now. `custom` keeps whatever was last typed. */
export function rangeFor(mode: RangeMode, now: number, custom: DayRange): DayRange {
  if (mode === 'week') return weekRange(now);
  if (mode === 'month') return monthRange(now);
  return custom;
}

/**
 * Week / Month / Custom, laid out as Task view's filters are (§3.6) — four equal
 * buttons on a phone, pills beside the heading on desktop.
 */
export function RangeRow({
  mode,
  custom,
  onMode,
  onCustom,
}: {
  mode: RangeMode;
  custom: DayRange;
  onMode: (next: RangeMode) => void;
  onCustom: (next: DayRange) => void;
}) {
  const field =
    'rounded-lg border border-[#28322B] bg-[#141A16] px-2 py-1 text-[12px] text-[#E8EFE9]';

  return (
    <div className="space-y-2 md:flex md:items-center md:gap-2 md:space-y-0">
      <div className="grid grid-cols-3 gap-1 md:flex md:gap-1.5">
        {MODES.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => onMode(key)}
            className={`rounded-lg border px-2 py-2 text-xs whitespace-nowrap md:rounded-full md:px-3 md:py-1 md:text-[11.5px] ${
              mode === key
                ? 'border-[#4CC26A] bg-[#4CC26A] font-semibold text-[#06210F]'
                : 'border-[#28322B] bg-[#141A16] text-[#8A9990]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === 'custom' && (
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={custom.from}
            max={custom.to}
            onChange={(e) => e.target.value && onCustom({ ...custom, from: e.target.value })}
            className={field}
            aria-label="From"
          />
          <span className="text-[11px] text-[#5F6E66]">to</span>
          <input
            type="date"
            value={custom.to}
            min={custom.from}
            onChange={(e) => e.target.value && onCustom({ ...custom, to: e.target.value })}
            className={field}
            aria-label="To"
          />
        </div>
      )}
    </div>
  );
}
