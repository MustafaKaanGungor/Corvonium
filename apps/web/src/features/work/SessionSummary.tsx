import {
  itemTotals,
  sessionTotals,
  type Item,
  type Project,
  type Session,
} from '@corvonium/shared';
import { formatSpan } from '../../lib/format';

/** One number and its label. */
function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#28322B] bg-[#141A16] px-3 py-2.5 text-center">
      <div className="text-base font-semibold tabular-nums">{value}</div>
      <div className="text-[10px] tracking-[0.1em] text-[#5F6E66] uppercase">{label}</div>
    </div>
  );
}

/** The focus percentage, drawn as a ring. Pure SVG — no chart library for one arc. */
function FocusRing({ focus }: { focus: number }) {
  const r = 46;
  const circumference = 2 * Math.PI * r;

  return (
    <svg viewBox="0 0 120 120" className="h-[120px] w-[120px] -rotate-90">
      <circle cx="60" cy="60" r={r} fill="none" stroke="#28322B" strokeWidth="10" />
      <circle
        cx="60"
        cy="60"
        r={r}
        fill="none"
        stroke="#4CC26A"
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - focus)}
      />
      <text
        x="60"
        y="60"
        className="rotate-90 fill-[#E8EFE9] text-[22px] font-semibold"
        style={{ transformOrigin: '60px 60px' }}
        textAnchor="middle"
        dominantBaseline="central"
      >
        {Math.round(focus * 100)}%
      </text>
    </svg>
  );
}

/**
 * What just happened, shown on End Session.
 *
 * Every number here is arithmetic over the segment list — §3.5. Reopening this
 * session tomorrow shows identical figures, because there is no stored total that
 * could have drifted from its parts.
 */
export function SessionSummary({
  session,
  items,
  projects,
  onDone,
}: {
  session: Session;
  items: Item[];
  projects: Project[];
  onDone: () => void;
}) {
  // The session has ended, so `now` no longer moves any of these.
  const totals = sessionTotals(session, session.endedAt ?? Date.now());
  const perItem = [...itemTotals([session], session.endedAt ?? Date.now())]
    .map(([id, ms]) => ({ item: items.find((i) => i.id === id), ms }))
    .filter((row): row is { item: Item; ms: number } => row.item !== undefined)
    .toSorted((a, b) => b.ms - a.ms);

  const longest = perItem[0]?.ms ?? 0;

  return (
    <div className="mx-auto flex h-full max-w-[440px] flex-col px-5 py-5">
      <h1 className="shrink-0 text-lg font-bold tracking-tight">Session done</h1>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="my-4 grid place-items-center">
          <FocusRing focus={totals.focus} />
          <p className="mt-1.5 text-[11.5px] text-[#5F6E66]">focus</p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Tile label="Work" value={formatSpan(totals.work)} />
          <Tile label="Break" value={formatSpan(totals.break)} />
          <Tile label="Segments" value={String(totals.count)} />
        </div>

        {perItem.length > 0 && (
          <section className="mt-5">
            <h2 className="mb-2 text-[10px] font-bold tracking-[0.13em] text-[#5F6E66] uppercase">
              Where it went
            </h2>

            <ul className="space-y-2">
              {perItem.map(({ item, ms }) => {
                const project = projects.find((p) => p.id === item.projectId);
                return (
                  <li key={item.id} className="flex items-center gap-2.5 text-[12.5px]">
                    <span className="w-[38%] shrink-0 truncate">{item.title}</span>
                    <span className="h-[6px] flex-1 overflow-hidden rounded-full bg-[#1C241E]">
                      <span
                        className="block h-full rounded-full"
                        style={{
                          width: `${longest === 0 ? 0 : (ms / longest) * 100}%`,
                          background: project?.color ?? '#4CC26A',
                        }}
                      />
                    </span>
                    <span className="shrink-0 tabular-nums text-[#8A9990]">{formatSpan(ms)}</span>
                  </li>
                );
              })}
            </ul>

            {/*
              Said plainly wherever per-item numbers appear — §2.6. A segment can
              carry several items and each gets the full length, so these will not
              add up to the work total. Splitting evenly would balance the columns
              and would be a fiction.
            */}
            <p className="mt-2.5 text-[11px] text-[#5F6E66]">
              Totals overlap: a segment carrying two items counts its full length against both, so
              these add up to more than {formatSpan(totals.work)}.
            </p>
          </section>
        )}
      </div>

      <button
        onClick={onDone}
        className="mt-4 shrink-0 rounded-xl bg-[#4CC26A] py-3 font-semibold text-[#06210F]"
      >
        Done
      </button>
    </div>
  );
}
