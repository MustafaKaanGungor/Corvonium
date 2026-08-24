import { isMissed, type Item } from '@corvonium/shared';
import { toggleDone } from '../../db/items';
import { formatDate, formatTime } from '../../lib/format';

export function ItemRow({ item, now }: { item: Item; now: number }) {
  const done = item.status === 'done';
  const missed = isMissed(item, now);

  return (
    <li className="flex items-start gap-3 rounded-lg bg-[#141A16] px-3 py-2.5">
      <button
        onClick={() => toggleDone(item)}
        aria-label={done ? 'Mark as not done' : 'Mark as done'}
        className={`mt-0.5 grid h-[19px] w-[19px] shrink-0 place-items-center rounded-full border-[1.5px] text-xs font-bold ${
          done ? 'border-[#4CC26A] bg-[#4CC26A] text-[#06210F]' : 'border-[#5F6E66]'
        }`}
      >
        {done ? '✓' : ''}
      </button>

      <div className="min-w-0">
        <div className={done ? 'text-[#5F6E66] line-through' : ''}>{item.title}</div>
        {item.due !== null && (
          <div className={`text-xs ${missed ? 'text-[#D9614F]' : 'text-[#8A9990]'}`}>
            {missed ? 'Missed · ' : 'Due '}
            {formatDate(item.due)} · {formatTime(item.due)}
          </div>
        )}
      </div>
    </li>
  );
}
