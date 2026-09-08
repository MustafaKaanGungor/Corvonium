import type { ReactNode } from 'react';
import { formatSpan } from '../../lib/format';

/**
 * The two chart shapes Stats needs, as inline SVG.
 *
 * No chart library: these are a polyline and a row of rectangles, and a dependency
 * that renders them would be larger than the app's own code for the screen.
 */

/** A titled card. The `.panel` from `design/corvonium-desktop.html`. */
export function Panel({
  title,
  children,
  note,
}: {
  title: string;
  children: ReactNode;
  note?: string;
}) {
  return (
    <section className="rounded-xl border border-[#28322B] bg-[#141A16] px-4 py-3.5">
      <h2 className="mb-3 text-[11px] font-semibold tracking-[0.04em] text-[#8A9990] uppercase">
        {title}
      </h2>
      {children}
      {note !== undefined && <p className="mt-2.5 text-[11px] text-[#5F6E66]">{note}</p>}
    </section>
  );
}

export type Bar = { key: string; label: string; ms: number; color: string };

/** A ranked list of labelled bars, scaled to the largest. */
export function BarRows({ rows, empty }: { rows: Bar[]; empty: string }) {
  const longest = rows[0]?.ms ?? 0;

  if (rows.length === 0) return <p className="py-2 text-[12.5px] text-[#5F6E66]">{empty}</p>;

  return (
    <ul className="space-y-2">
      {rows.map(({ key, label, ms, color }) => (
        <li key={key} className="flex items-center gap-2.5 text-[12px]">
          <span className="w-[34%] shrink-0 truncate">{label}</span>
          <span className="h-[6px] flex-1 overflow-hidden rounded-full bg-[#1C241E]">
            <span
              className="block h-full rounded-full"
              style={{ width: `${longest === 0 ? 0 : (ms / longest) * 100}%`, background: color }}
            />
          </span>
          <span className="w-[52px] shrink-0 text-right tabular-nums text-[#8A9990]">
            {formatSpan(ms)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * One bar per day in the range, in order.
 *
 * Every day is drawn, including the ones with nothing on them — a gap is the
 * information, and dropping empty days would quietly flatter the week.
 */
export function DayBars({ days }: { days: { key: string; ms: number }[] }) {
  const tallest = Math.max(...days.map((d) => d.ms), 1);
  const W = 320;
  const H = 96;
  const gap = 3;
  const width = Math.max(1, W / Math.max(days.length, 1) - gap);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Hours per day">
      {days.map((day, i) => {
        const h = day.ms === 0 ? 2 : Math.max(2, (day.ms / tallest) * (H - 4));
        return (
          <rect
            key={day.key}
            x={i * (width + gap)}
            y={H - h}
            width={width}
            height={h}
            rx="2"
            fill="#4CC26A"
            // Faded in proportion to the day, so a light day reads as light at a
            // glance rather than only by height.
            opacity={day.ms === 0 ? 0.18 : 0.35 + 0.65 * (day.ms / tallest)}
          >
            <title>{`${day.key} — ${formatSpan(day.ms)}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

/**
 * Focus percentage over the days that had any work.
 *
 * Days with no work are skipped rather than plotted as 0%: you did not have a bad
 * focus day on a Sunday you never worked, and drawing one would invent a dip.
 */
export function FocusLine({ points }: { points: { key: string; focus: number }[] }) {
  if (points.length < 2) {
    return (
      <p className="py-2 text-[12.5px] text-[#5F6E66]">
        Two worked days are needed before a trend means anything.
      </p>
    );
  }

  const W = 320;
  const H = 96;
  const step = W / (points.length - 1);
  const y = (focus: number) => H - 6 - focus * (H - 12);

  const line = points.map((p, i) => `${i * step},${y(p.focus)}`).join(' ');
  const last = points.at(-1);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Focus trend, ending at ${Math.round((last?.focus ?? 0) * 100)}%`}
    >
      <polyline
        points={line}
        fill="none"
        stroke="#4CC26A"
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      {last && <circle cx={W - 3} cy={y(last.focus)} r="4.5" fill="#4CC26A" />}
    </svg>
  );
}
