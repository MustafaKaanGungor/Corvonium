import type { Match } from '@corvonium/shared';

/**
 * One line in, an item out — §3.7.
 *
 * **Both the input and the result stay visible.** The words the parser consumed
 * are marked in place in what you typed, and each value is a chip you can tap off.
 * That visibility is not decoration: it is what lets the parser match modifiers
 * *anywhere* in a sentence rather than only at the end. A parser that edits your
 * words invisibly is worse than none; one that shows its work can afford to be
 * aggressive.
 */
export function CaptureField({
  text,
  matches,
  projectColour,
  onText,
  onDismiss,
}: {
  text: string;
  /** The matches that actually applied — dismissed ones are already gone. */
  matches: Match[];
  projectColour: (projectId: string | null | undefined) => string | undefined;
  onText: (next: string) => void;
  onDismiss: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          autoFocus
          value={text}
          onChange={(e) => onText(e.target.value)}
          placeholder="Take the garbage out every 2 days important home"
          aria-label="Quick capture"
          className="min-w-0 flex-1 rounded-lg border border-[#28322B] bg-[#1C241E] px-3 py-2 text-[#E8EFE9]"
        />

        {/*
          Voice is its own block: §2.7 puts Whisper behind a 75–145 MB lazy
          download. Disabled and labelled rather than absent, so the shape of the
          field does not change when it arrives.
        */}
        <button
          type="button"
          disabled
          aria-label="Dictate (coming later)"
          title="Dictation arrives with the voice block"
          className="grid w-10 shrink-0 place-items-center rounded-lg border border-[#28322B] text-[#5F6E66] disabled:opacity-40"
        >
          🎤
        </button>
      </div>

      {matches.length > 0 && (
        <>
          {/* The raw line, with what was consumed underlined where it sits. */}
          <p className="px-1 text-[12.5px] leading-relaxed break-words text-[#5F6E66]">
            {segments(text, matches).map((segment, i) =>
              segment.match === null ? (
                <span key={i}>{segment.text}</span>
              ) : (
                <mark
                  key={i}
                  className="bg-transparent text-[#E8EFE9] underline decoration-[#4CC26A] decoration-2 underline-offset-2"
                >
                  {segment.text}
                </mark>
              ),
            )}
          </p>

          <div className="flex flex-wrap gap-1.5">
            {matches.map((match) => (
              <button
                key={match.id}
                type="button"
                onClick={() => onDismiss(match.id)}
                aria-label={`Undo ${match.label}`}
                className="flex items-center gap-1.5 rounded-full border border-[#4CC26A] px-2.5 py-1 text-xs text-[#E8EFE9]"
              >
                {match.kind === 'project' && (
                  <span
                    className="h-[7px] w-[7px] rounded-full"
                    style={{ background: projectColour(match.fields.projectId) ?? '#4CC26A' }}
                  />
                )}
                {match.label}
                <span className="text-[#5F6E66]">✕</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * The line split into matched and unmatched runs.
 *
 * Driven straight off the spans the parser reported, so the marking cannot drift
 * out of step with what was actually consumed.
 */
function segments(text: string, matches: Match[]): { text: string; match: Match | null }[] {
  const out: { text: string; match: Match | null }[] = [];
  let cursor = 0;

  for (const match of matches.toSorted((a, b) => a.start - b.start)) {
    if (match.start > cursor) out.push({ text: text.slice(cursor, match.start), match: null });
    out.push({ text: text.slice(match.start, match.end), match });
    cursor = match.end;
  }

  if (cursor < text.length) out.push({ text: text.slice(cursor), match: null });
  return out;
}
