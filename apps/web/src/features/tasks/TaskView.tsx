import { matrixGroup, type Item, type MatrixGroup } from '@corvonium/shared';
import { ItemRow } from '../items/ItemRow';

// Until settings exist. Plan §2.8: one global number, default 2.
const URGENT_WITHIN_DAYS = 2;

const GROUPS: { key: MatrixGroup; label: string }[] = [
  { key: 'routine', label: 'Routine' },
  { key: 'urgent-important', label: 'Urgent & important' },
  { key: 'important', label: 'Important, not urgent' },
  { key: 'urgent', label: 'Urgent, not important' },
  { key: 'neither', label: 'Neither' },
];

export function TaskView({ items, now }: { items: Item[]; now: number }) {
  const open = items.filter((i) => i.status === 'open');

  return (
    <div className="space-y-5">
      {GROUPS.map(({ key, label }) => {
        const inGroup = open.filter((i) => matrixGroup(i, now, URGENT_WITHIN_DAYS) === key);
        return (
          <section key={key}>
            <h2 className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[#5F6E66]">
              {label}
            </h2>
            {inGroup.length === 0 ? (
              <p className="px-1 text-xs text-[#3D4A42]">Nothing here</p>
            ) : (
              <ul className="space-y-1.5">
                {inGroup.map((item) => (
                  <ItemRow key={item.id} item={item} now={now} />
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
