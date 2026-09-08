import { useEffect, useState } from 'react';
import {
  isSuspect,
  itemTotals,
  liveSegment,
  localDayKey,
  segmentDuration,
  sessionTotals,
  type Item,
  type Project,
  type Session,
} from '@corvonium/shared';
import { endSession, setItems, switchTo, touchSession } from '../../db/sessions';
import { formatDuration, formatSpan } from '../../lib/format';
import { useNow } from '../../lib/useNow';
import { useMediaQuery, WIDE } from '../../lib/useMediaQuery';
import { navigate } from '../../lib/router';
import { Sheet } from '../../components/Sheet';
import { ItemPicker } from './ItemPicker';
import { ResumePrompt } from './ResumePrompt';
import { SegmentList } from './SegmentList';
import { SessionSummary } from './SessionSummary';

const HEARTBEAT_MS = 60_000;

/**
 * Write `lastSeenAt` once a minute while this screen is open **and visible**.
 *
 * The visibility condition is the part that matters. A backgrounded tab is
 * throttled to roughly this interval rather than stopped, so without the check the
 * heartbeat would keep beating all night and the failsafe it exists to feed would
 * never fire.
 */
function useHeartbeat(session: Session | null) {
  useEffect(() => {
    if (session === null || session.endedAt !== null) return;

    const beat = () => {
      if (document.visibilityState === 'visible') void touchSession(session, Date.now());
    };

    beat();
    const id = setInterval(beat, HEARTBEAT_MS);
    document.addEventListener('visibilitychange', beat);

    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', beat);
    };
  }, [session]);
}

/** The running time in the tab title, so a glance catches a forgotten session. */
function useTitle(text: string | null) {
  useEffect(() => {
    if (text === null) return;
    document.title = text;
    return () => {
      document.title = 'Corvonium';
    };
  }, [text]);
}

type Props = {
  sessions: Session[];
  items: Item[];
  projects: Project[];
};

export function WorkScreen({ sessions, items, projects }: Props) {
  // A session's clock counts seconds; everything else in the app is happy with a
  // minute. `useNow` already takes the interval — one hook, two rates.
  const now = useNow(1000);
  const wide = useMediaQuery(WIDE);

  const [picking, setPicking] = useState(false);
  const [keptId, setKeptId] = useState<string | null>(null);
  const [endedId, setEndedId] = useState<string | null>(null);

  const live = sessions.find((s) => s.endedAt === null) ?? null;
  const ended = endedId === null ? null : (sessions.find((s) => s.id === endedId) ?? null);

  /*
    Judge the session BEFORE the heartbeat is allowed to touch it.

    `lastSeenAt` is the evidence that a session was forgotten, and the heartbeat
    overwrites it — including once immediately on mount. Beating first would mean
    that opening the tab after leaving a session running all night resets the very
    value the check reads, and the prompt could never fire. So the heartbeat is
    withheld until the session is either not suspect or explicitly kept.
  */
  const suspicion = live === null || live.id === keptId ? null : isSuspect(live, now);

  useHeartbeat(suspicion === null ? live : null);

  const segment = live === null ? null : liveSegment(live);
  const totals = live === null ? null : sessionTotals(live, now);

  useTitle(totals === null ? null : `${formatDuration(totals.total)} · Corvonium`);

  // The summary is the last thing a session does; it outlives the live session.
  if (ended !== null) {
    return (
      <SessionSummary
        session={ended}
        items={items}
        projects={projects}
        onDone={() => {
          setEndedId(null);
          navigate('today');
        }}
      />
    );
  }

  if (live === null) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
        <h1 className="text-xl font-bold tracking-tight">No session running</h1>
        <p className="max-w-[34ch] text-sm text-[#5F6E66]">
          Start the day from Today, and the clock begins here.
        </p>
        <a
          href="#/today"
          className="rounded-xl bg-[#4CC26A] px-5 py-2.5 text-sm font-semibold text-[#06210F] no-underline"
        >
          Back to Today
        </a>
      </div>
    );
  }

  // A suspect session is intercepted before the timer renders, so a forgotten one
  // cannot quietly keep accruing while you look at it.
  if (suspicion !== null) {
    return (
      <ResumePrompt
        session={live}
        reason={suspicion}
        now={now}
        onKeep={() => setKeptId(live.id)}
        onEndAt={(at) => {
          void endSession(live, at);
          setEndedId(live.id);
        }}
      />
    );
  }

  const working = segment?.kind === 'work';
  const onItems = (segment?.itemIds ?? [])
    .map((id) => items.find((item) => item.id === id)?.title)
    .filter((title): title is string => title !== undefined);

  // Today so far, across every session that started today — §2.6: the day is the
  // unit of reporting, never the session.
  const todayKey = localDayKey(now);
  const perItem = [
    ...itemTotals(
      sessions.filter((s) => localDayKey(s.startedAt) === todayKey),
      now,
    ),
  ]
    .map(([id, ms]) => ({ item: items.find((i) => i.id === id), ms }))
    .filter((row): row is { item: Item; ms: number } => row.item !== undefined)
    .toSorted((a, b) => b.ms - a.ms);
  const longest = perItem[0]?.ms ?? 0;

  const ghost = 'rounded-xl border border-[#28322B] py-2.5 text-sm text-[#E8EFE9]';

  const main = (
    <div className="flex h-full flex-col items-center justify-center gap-1 px-5 text-center">
      <p className="text-[10px] font-bold tracking-[0.13em] text-[#5F6E66] uppercase">Total</p>
      <p className="text-[34px] leading-none font-semibold tabular-nums">
        {formatDuration(totals?.total ?? 0, 'always')}
      </p>

      <div className="mt-6 w-full max-w-[320px] rounded-2xl border border-[#28322B] bg-[#141A16] px-4 py-5">
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-bold tracking-[0.1em]"
          style={{
            background: working ? '#4CC26A' : '#E0A040',
            color: '#06210F',
          }}
        >
          {working ? 'WORK' : 'BREAK'}
        </span>
        <p className="mt-2 text-[26px] leading-none font-semibold tabular-nums">
          {formatDuration(segment === null ? 0 : segmentDuration(segment, now), 'always')}
        </p>
        <p className="mt-2 min-h-[18px] text-[12.5px] text-[#8A9990]">
          {onItems.length === 0 ? 'Nothing in particular' : onItems.join(' · ')}
        </p>
      </div>

      <div className="mt-6 grid w-full max-w-[320px] gap-2">
        <button
          onClick={() => void switchTo(live, working ? 'break' : 'work', Date.now())}
          className="rounded-xl bg-[#4CC26A] py-3 text-sm font-semibold text-[#06210F]"
        >
          {working ? 'Take a Break' : 'Back to Work'}
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setPicking(true)} className={ghost}>
            Switch item
          </button>
          <button
            onClick={() => {
              void endSession(live, Date.now());
              setEndedId(live.id);
            }}
            className={ghost}
          >
            End Session
          </button>
        </div>
      </div>
    </div>
  );

  const side = (
    <div className="flex h-full flex-col p-5">
      <p className="text-sm font-semibold">This session</p>
      <p className="mt-0.5 mb-3 text-[11.5px] text-[#8A9990]">
        Started{' '}
        {new Date(live.startedAt).toLocaleTimeString('en-GB', {
          hour: '2-digit',
          minute: '2-digit',
        })}{' '}
        · {totals?.count} segment{totals?.count === 1 ? '' : 's'}
      </p>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <SegmentList segments={live.segments} items={items} now={now} />

        {perItem.length > 0 && (
          <section className="mt-5">
            <h2 className="mb-2 text-[10px] font-bold tracking-[0.13em] text-[#5F6E66] uppercase">
              Today so far
            </h2>
            <ul className="space-y-2">
              {perItem.map(({ item, ms }) => {
                const project = projects.find((p) => p.id === item.projectId);
                return (
                  <li key={item.id} className="flex items-center gap-2.5 text-[12px]">
                    <span className="w-[36%] shrink-0 truncate">{item.title}</span>
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
            <p className="mt-2 text-[11px] text-[#5F6E66]">
              Totals overlap — a segment carrying two items counts its full length against both.
            </p>
          </section>
        )}
      </div>
    </div>
  );

  return (
    <div className="mx-auto h-full max-w-[1180px]">
      {wide ? (
        <div className="grid h-full grid-cols-[1fr_340px]">
          <div className="min-h-0">{main}</div>
          <div className="min-h-0 overflow-hidden border-l border-[#28322B] bg-[#0F1411]">
            {side}
          </div>
        </div>
      ) : (
        // The phone stacks: the clock and its actions, then the history under it.
        <div className="flex h-full flex-col">
          <div className="shrink-0 pt-4 pb-2">{main}</div>
          <div className="min-h-0 flex-1 overflow-y-auto border-t border-[#28322B]">{side}</div>
        </div>
      )}

      <Sheet open={picking} onClose={() => setPicking(false)}>
        {picking && (
          <ItemPicker
            items={items}
            projects={projects}
            now={now}
            initial={segment?.itemIds ?? []}
            onCancel={() => setPicking(false)}
            onConfirm={(itemIds) => {
              void setItems(live, itemIds, Date.now());
              setPicking(false);
            }}
          />
        )}
      </Sheet>
    </div>
  );
}
