import { useState } from 'react';
import { todayGroup, type Item, type Project } from '@corvonium/shared';

/**
 * Choose what you are working on. Multi-select, because §2.6 makes a segment carry
 * several items — working on two things at once is normal.
 *
 * §3.5 calls today's list "the obvious source", and it leads; but working on
 * something that is not in Today is ordinary, so everything else open follows
 * underneath rather than being unreachable.
 */
export function ItemPicker({
  items,
  projects,
  now,
  initial,
  onCancel,
  onConfirm,
}: {
  items: Item[];
  projects: Project[];
  now: number;
  initial: string[];
  onCancel: () => void;
  onConfirm: (itemIds: string[]) => void;
}) {
  const [picked, setPicked] = useState<string[]>(initial);

  const open = items.filter((item) => item.status === 'open');
  const today = open.filter((item) => todayGroup(item, now) !== null);
  const rest = open.filter((item) => todayGroup(item, now) === null);

  function toggle(id: string) {
    setPicked((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );
  }

  function section(label: string, list: Item[]) {
    if (list.length === 0) return null;

    return (
      <section className="mb-3">
        <h3 className="mb-1.5 text-[10px] font-bold tracking-[0.13em] text-[#5F6E66] uppercase">
          {label}
        </h3>
        <ul className="space-y-1">
          {list.map((item) => {
            const on = picked.includes(item.id);
            const project = projects.find((p) => p.id === item.projectId);

            return (
              <li key={item.id}>
                <button
                  onClick={() => toggle(item.id)}
                  aria-pressed={on}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm ${
                    on ? 'bg-[#1C241E] shadow-[inset_2px_0_0_#4CC26A]' : 'bg-[#141A16]'
                  }`}
                >
                  <span
                    className={`grid h-[19px] w-[19px] shrink-0 place-items-center rounded border-[1.5px] text-xs font-bold ${
                      on ? 'border-[#4CC26A] bg-[#4CC26A] text-[#06210F]' : 'border-[#5F6E66]'
                    }`}
                  >
                    {on ? '✓' : ''}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{item.title}</span>
                  {project && (
                    <span
                      title={project.name}
                      className="h-[7px] w-[7px] shrink-0 rounded-full"
                      style={{ background: project.color }}
                    />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    );
  }

  return (
    <div className="flex max-h-[70vh] flex-col md:max-h-none">
      <p className="mb-1 text-sm font-semibold">What are you working on?</p>
      <p className="mb-3 text-[11.5px] text-[#8A9990]">
        Picking more than one is fine — the time counts in full against each.
      </p>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {open.length === 0 ? (
          <p className="py-6 text-sm text-[#5F6E66]">
            Nothing open to work on. You can still track the time without an item.
          </p>
        ) : (
          <>
            {section('Today', today)}
            {section('Everything else', rest)}
          </>
        )}
      </div>

      <div className="mt-3 flex shrink-0 gap-2">
        <button
          onClick={() => onConfirm(picked)}
          className="flex-1 rounded-lg bg-[#4CC26A] px-4 py-2 font-semibold text-[#06210F]"
        >
          {picked.length === 0 ? 'Work on nothing in particular' : `Start on ${picked.length}`}
        </button>
        <button onClick={onCancel} className="rounded-lg bg-[#1C241E] px-4 py-2 text-[#E8EFE9]">
          Cancel
        </button>
      </div>
    </div>
  );
}
