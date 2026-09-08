import type { Dispatch, SetStateAction } from 'react';
import { buildRule, describeRule, parseRule, type RulePart } from '@corvonium/shared';

/** The §2.4 preset table. `custom` is the escape hatch to a raw RRULE. */
type Preset =
  'never' | 'daily' | 'every-n-days' | 'weekly' | 'every-n-weeks' | 'monthly' | 'custom';

const PRESETS: { key: Preset; label: string }[] = [
  { key: 'never', label: 'Does not repeat' },
  { key: 'daily', label: 'Every day' },
  { key: 'every-n-days', label: 'Every N days' },
  { key: 'weekly', label: 'Every week, on chosen days' },
  { key: 'every-n-weeks', label: 'Every N weeks' },
  { key: 'monthly', label: 'Every month' },
  { key: 'custom', label: 'Custom rule' },
];

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** Which preset a stored rule came from, so reopening the form shows what you set. */
function presetOf(rrule: string | null): Preset {
  if (rrule === null) return 'never';

  const part = parseRule(rrule);
  if (part === null) return 'custom';

  if (part.freq === 'monthly') return part.interval === 1 ? 'monthly' : 'custom';
  if (part.freq === 'daily') return part.interval === 1 ? 'daily' : 'every-n-days';
  return part.byWeekday.length > 0 ? 'weekly' : part.interval === 1 ? 'weekly' : 'every-n-weeks';
}

const field = 'w-full rounded-lg bg-[#1C241E] border border-[#28322B] px-3 py-2 text-[#E8EFE9]';

/** A rule as preset parts, falling back to a daily default for an unreadable one. */
function partOf(rrule: string | null): RulePart {
  return parseRule(rrule ?? '') ?? { freq: 'daily', interval: 1, byWeekday: [] };
}

export function RepeatField({
  value,
  error,
  onChange,
}: {
  value: string | null;
  /** From `recurrenceError` — a rule with nothing to repeat from. */
  error: string | null;
  /**
   * Takes an updater as well as a value, which the weekday toggles need: React
   * batches clicks, so two quick taps would both read the same stale rule from
   * `value` and the first one would be lost.
   */
  onChange: Dispatch<SetStateAction<string | null>>;
}) {
  const preset = presetOf(value);
  const part = partOf(value);

  /** Change part of the rule, always against the latest one rather than a prop. */
  function set(next: (current: RulePart) => Partial<RulePart>) {
    onChange((prev) => {
      const current = partOf(prev);
      return buildRule({ ...current, ...next(current) });
    });
  }

  function choose(next: Preset) {
    switch (next) {
      case 'never':
        return onChange(null);
      case 'daily':
        return onChange(buildRule({ freq: 'daily', interval: 1, byWeekday: [] }));
      case 'every-n-days':
        return onChange(buildRule({ freq: 'daily', interval: 2, byWeekday: [] }));
      case 'weekly':
        return onChange(buildRule({ freq: 'weekly', interval: 1, byWeekday: [] }));
      case 'every-n-weeks':
        return onChange(buildRule({ freq: 'weekly', interval: 2, byWeekday: [] }));
      case 'monthly':
        return onChange(buildRule({ freq: 'monthly', interval: 1, byWeekday: [] }));
      case 'custom':
        // Seed from whatever is set, so Custom starts from the rule you had.
        return onChange(value ?? 'FREQ=DAILY');
    }
  }

  function toggleDay(day: number) {
    set((current) => ({
      freq: 'weekly',
      byWeekday: current.byWeekday.includes(day)
        ? current.byWeekday.filter((d) => d !== day)
        : [...current.byWeekday, day],
    }));
  }

  const showsInterval = preset === 'every-n-days' || preset === 'every-n-weeks';

  return (
    <div className="space-y-2 rounded-lg border border-[#28322B] p-3">
      <span className="text-xs tracking-[0.12em] text-[#5F6E66] uppercase">Repeat</span>

      <select value={preset} onChange={(e) => choose(e.target.value as Preset)} className={field}>
        {PRESETS.map(({ key, label }) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </select>

      {showsInterval && (
        <label className="block text-sm text-[#8A9990]">
          Every
          <input
            type="number"
            min={2}
            max={365}
            value={part.interval}
            onChange={(e) => {
              const interval = Math.max(2, Number(e.target.value) || 2);
              set(() => ({ interval }));
            }}
            className={`${field} mt-1`}
          />
          <span className="text-xs">{preset === 'every-n-days' ? 'days' : 'weeks'}</span>
        </label>
      )}

      {preset === 'weekly' && (
        <div>
          <span className="block text-sm text-[#8A9990]">On</span>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {DAYS.map((letter, day) => {
              const on = part.byWeekday.includes(day);
              return (
                <button
                  key={DAY_NAMES[day]}
                  type="button"
                  onClick={() => toggleDay(day)}
                  aria-label={DAY_NAMES[day]}
                  aria-pressed={on}
                  className={`rounded-lg border py-1.5 text-xs ${
                    on
                      ? 'border-[#4CC26A] bg-[#4CC26A] font-semibold text-[#06210F]'
                      : 'border-[#28322B] bg-[#141A16] text-[#8A9990]'
                  }`}
                >
                  {letter}
                </button>
              );
            })}
          </div>
          {part.byWeekday.length === 0 && (
            <p className="mt-1 text-xs text-[#5F6E66]">
              With no day picked it repeats weekly on the item&rsquo;s own day.
            </p>
          )}
        </div>
      )}

      {preset === 'custom' && (
        <label className="block text-sm text-[#8A9990]">
          RRULE
          <input
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value || null)}
            placeholder="FREQ=MONTHLY;BYMONTHDAY=13"
            className={`${field} mt-1 font-mono text-xs`}
          />
          <span className="text-xs">
            {value !== null && parseRule(value) === null
              ? 'Not a rule this app can read — it will not repeat.'
              : 'RFC 5545, the same format calendars use.'}
          </span>
        </label>
      )}

      {value !== null && preset !== 'never' && (
        <p className="text-xs text-[#4CC26A]">{describeRule(value)}</p>
      )}

      {error !== null && <p className="text-xs text-[#D9614F]">{error}</p>}
    </div>
  );
}
