import { useState } from 'react';
import {
  liveSegment,
  segmentDuration,
  sessionTotals,
  trimError,
  type Session,
  type Suspicion,
} from '@corvonium/shared';
import { formatDuration, formatSpan, fromDateTimeLocal, toDateTimeLocal } from '../../lib/format';

/**
 * Shown instead of the timer when a running session looks forgotten.
 *
 * The rule this screen exists to keep: **it asks, and never edits your data
 * silently.** Auto-capping would invent an end time you did not choose and
 * truncate a genuine long stretch, and Stats has no way to mark a number as
 * doubtful after the fact.
 */
export function ResumePrompt({
  session,
  reason,
  now,
  onKeep,
  onEndAt,
}: {
  session: Session;
  reason: Suspicion;
  now: number;
  onKeep: () => void;
  onEndAt: (at: number) => void;
}) {
  const [custom, setCustom] = useState<string | null>(null);

  const live = liveSegment(session);
  const elapsed = sessionTotals(session, now).total;
  // The break's own length, not the session's — they differ whenever any work
  // came first, which is nearly always.
  const onBreakFor = live === null ? 0 : segmentDuration(live, now);
  const at = custom === null ? null : fromDateTimeLocal(custom);
  const error = at === null ? null : trimError(session, at, now);

  const started = new Date(session.startedAt).toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

  const seen = new Date(session.lastSeenAt).toLocaleString('en-GB', {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

  const ghost = 'rounded-xl border border-[#28322B] py-2.5 text-sm text-[#E8EFE9]';

  return (
    <div className="mx-auto flex h-full max-w-[440px] flex-col justify-center gap-4 px-5">
      <div>
        <h1 className="text-lg font-bold tracking-tight">Session still running</h1>
        <p className="mt-1 text-[12.5px] text-[#8A9990]">
          Started {started} · {formatSpan(elapsed)} · on a{' '}
          {live?.kind === 'break' ? 'break' : 'work segment'}
        </p>
      </div>

      <p className="rounded-xl border border-[#E0A040]/40 bg-[#E0A040]/10 p-3 text-[12.5px] text-[#E0A040]">
        {reason === 'work-idle' ? (
          <>Corvonium last saw you at {seen}. It looks like this kept counting after you stopped.</>
        ) : (
          <>
            This break has run {formatSpan(onBreakFor)}. Corvonium cannot tell a long break from a
            forgotten one — if it was real, keep it.
          </>
        )}
      </p>

      {custom === null ? (
        <div className="grid gap-2">
          <button
            onClick={() => onEndAt(session.lastSeenAt)}
            className="rounded-xl bg-[#4CC26A] py-3 text-sm font-semibold text-[#06210F]"
          >
            End it at {seen}
          </button>
          <button onClick={onKeep} className={ghost}>
            Keep it all and carry on
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => onEndAt(now)} className={ghost}>
              End it now
            </button>
            <button
              onClick={() => setCustom(toDateTimeLocal(session.lastSeenAt))}
              className={ghost}
            >
              Set a time…
            </button>
          </div>
        </div>
      ) : (
        <div className="grid gap-2">
          <label className="block text-sm text-[#8A9990]">
            End the session at
            {/*
              A datetime, not a time: a forgotten session routinely spans midnight,
              where "19:30" would be ambiguous about which day it meant.
            */}
            <input
              type="datetime-local"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#28322B] bg-[#1C241E] px-3 py-2 text-[#E8EFE9]"
            />
          </label>

          {error !== null && <p className="text-xs text-[#D9614F]">{error}</p>}

          {at !== null && error === null && (
            <p className="text-xs text-[#8A9990]">
              That makes it {formatDuration(at - session.startedAt, 'always')} long.
            </p>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              disabled={at === null || error !== null}
              onClick={() => at !== null && onEndAt(at)}
              className="rounded-xl bg-[#4CC26A] py-2.5 text-sm font-semibold text-[#06210F] disabled:opacity-40"
            >
              End it there
            </button>
            <button onClick={() => setCustom(null)} className={ghost}>
              Back
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
