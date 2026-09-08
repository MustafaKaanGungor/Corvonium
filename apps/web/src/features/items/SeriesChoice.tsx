import { describeRule, type Item, type SeriesScope } from '@corvonium/shared';
import { formatDate } from '../../lib/format';

const CHOICES: { key: SeriesScope; label: string; detail: string }[] = [
  { key: 'one', label: 'Just this one', detail: 'The rest of the series is untouched.' },
  {
    key: 'future',
    label: 'This and all future',
    detail: 'Everything before this date stays as it is.',
  },
  { key: 'all', label: 'All of them', detail: 'Including the ones already behind you.' },
];

/**
 * The three-way choice §2.4 requires before changing anything that repeats.
 *
 * One component for both paths: the plan is explicit that **editing needs the
 * identical choice** to cancelling, and two copies would drift.
 *
 * It appears every time, with no "don't ask again" — the three outcomes are far
 * enough apart that guessing wrong is worse than one extra tap.
 */
export function SeriesChoice({
  occurrence,
  verb,
  onCancel,
  onChoose,
}: {
  occurrence: Item;
  /** What the choice is about, so the heading reads as the action you took. */
  verb: 'Save' | 'Cancel';
  onCancel: () => void;
  onChoose: (scope: SeriesScope) => void;
}) {
  const when = occurrence.originalStart === null ? null : formatDate(occurrence.originalStart);

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold">{occurrence.title}</p>
        <p className="mt-0.5 text-[11.5px] text-[#8A9990]">
          {occurrence.rrule === null ? 'This repeats' : describeRule(occurrence.rrule)}
          {when === null ? '' : ` · this one is ${when}`}
        </p>
      </div>

      <p className="text-sm text-[#8A9990]">
        {verb === 'Save' ? 'Which occurrences should this change?' : 'Which ones do you mean?'}
      </p>

      <div className="grid gap-2">
        {CHOICES.map(({ key, label, detail }) => (
          <button
            key={key}
            onClick={() => onChoose(key)}
            className="rounded-xl border border-[#28322B] px-3 py-2.5 text-left"
          >
            <span
              className={`block text-sm ${key === 'all' && verb === 'Cancel' ? 'text-[#D9614F]' : 'text-[#E8EFE9]'}`}
            >
              {label}
            </span>
            <span className="block text-[11.5px] text-[#5F6E66]">{detail}</span>
          </button>
        ))}
      </div>

      <button
        onClick={onCancel}
        className="w-full rounded-lg bg-[#1C241E] px-4 py-2 text-sm text-[#E8EFE9]"
      >
        Never mind
      </button>
    </div>
  );
}
