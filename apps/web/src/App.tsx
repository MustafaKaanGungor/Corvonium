import { localDate } from '@corvonium/shared';
import { addItem, useItems } from './db/hooks';

export default function App() {
  const items = useItems();

  return (
    <div className="min-h-dvh bg-[#0A0E0C] text-[#E8EFE9] p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">
          Corvo<span className="text-[#4CC26A]">nium</span>
        </h1>
        <p className="text-sm text-[#8A9990]">{localDate(Date.now())}</p>
      </header>

      <button
        onClick={() => addItem({ title: `Item ${new Date().toLocaleTimeString()}` })}
        className="rounded-lg bg-[#4CC26A] px-4 py-2 font-semibold text-[#06210F]"
      >
        Add item
      </button>

      <ul className="mt-6 space-y-2">
        {items == null && <li className="text-[#5F6E66]">Loading…</li>}
        {items?.length === 0 && <li className="text-[#5F6E66]">No items yet.</li>}
        {items?.map((item) => (
          <li key={item.id} className="rounded-lg bg-[#141A16] px-4 py-3">
            {item.title}
          </li>
        ))}
      </ul>
    </div>
  );
}