/**
 * A new build is waiting.
 *
 * Deliberately an offer rather than an event: reloading interrupts a running Work
 * Mode clock and drops the calendar's in-memory mode. The session itself survives
 * — it lives in the database and is rebuilt from `startedAt` — but choosing the
 * moment belongs to whoever is using the app.
 *
 * It sits above the navbar rather than over the content, so it never covers the
 * thing you were about to tap.
 */
export function UpdateBar({ onUpdate }: { onUpdate: () => void }) {
  return (
    <div className="flex shrink-0 items-center gap-3 border-t border-[#28322B] bg-[#1C241E] px-4 py-2.5">
      <span className="min-w-0 flex-1 text-[12.5px] text-[#E8EFE9]">A new version is ready.</span>
      <button
        onClick={onUpdate}
        className="shrink-0 rounded-lg bg-[#4CC26A] px-3 py-1.5 text-[12px] font-semibold text-[#06210F]"
      >
        Reload
      </button>
    </div>
  );
}
