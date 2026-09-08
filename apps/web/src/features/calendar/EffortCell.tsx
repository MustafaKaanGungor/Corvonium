import { localDayKey, type SessionTotals } from '@corvonium/shared';

/** What a full day of focused work is measured against — §3.2's scale. */
const FULL_DAY_MS = 8 * 3_600_000;

/**
 * One day in Effort mode.
 *
 * Three states, and the middle one is the reason this is its own component:
 *
 * | Day           | Shows                                            |
 * |---------------|--------------------------------------------------|
 * | Worked        | hours above a bar, height *and* opacity scaled   |
 * | Past, no work | a thin flat track — present but empty            |
 * | Future        | nothing                                          |
 *
 * §3.2 records why the empty track matters: an earlier pass drew a dash on every
 * workless day, and the back half of the month read as a rendering failure rather
 * than as a month that has not happened yet.
 */
export function EffortCell({
  totals,
  day,
  today,
  now,
}: {
  totals: SessionTotals | undefined;
  day: string;
  today: string;
  now: number;
}) {
  const worked = totals?.work ?? 0;

  // Days after today have nothing to say yet, so they say nothing.
  if (day > today || (day > localDayKey(now) && worked === 0)) return null;

  if (worked === 0) {
    return (
      <div className="absolute inset-x-[10px] bottom-2 flex flex-col justify-end">
        <div className="h-[3px] w-full rounded-[3px] bg-[#28322B]" />
      </div>
    );
  }

  const share = Math.min(worked / FULL_DAY_MS, 1);
  const hours = worked / 3_600_000;

  return (
    <div className="absolute inset-x-[10px] top-[25px] bottom-2 flex flex-col items-center justify-end gap-1">
      <span className="text-[11px] tabular-nums text-[#8A9990]">
        {hours.toFixed(1).replace('.0', '')}h
      </span>
      <div
        className="w-full rounded-[3px] bg-[#4CC26A]"
        style={{
          // Height and opacity both carry the number, so a light day reads as
          // light at a glance rather than only by measuring it.
          height: `${Math.max(4, share * 100)}%`,
          opacity: 0.45 + share * 0.55,
        }}
      />
    </div>
  );
}
