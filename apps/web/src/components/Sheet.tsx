import { useEffect, useRef, type ReactNode } from 'react';

type Props = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
};

export function Sheet({ open, onClose, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  /*
    A modal `<dialog>` does not light-dismiss: the backdrop swallows the click and
    nothing happens, so Escape was the only way out and nothing on screen said so.

    Every sheet dismisses this way, forms included. That does discard a half-typed
    item — but **Escape already did exactly that**, so the alternative was not
    "your typing is safe", it was two exits behaving differently for no reason a
    user could see.

    The backdrop belongs to the dialog element, so a click on it reports the dialog
    as its target — which is why this compares coordinates against the panel's own
    box instead. Both the press *and* the release have to be outside, so selecting
    text inside the panel and releasing beyond its edge does not dismiss it.
  */
  const pressedOutside = useRef(false);

  function isOutside(x: number, y: number): boolean {
    const el = ref.current;
    if (!el) return false;

    const r = el.getBoundingClientRect();
    return x < r.left || x > r.right || y < r.top || y > r.bottom;
  }

  function handlePointerDown(event: React.PointerEvent) {
    pressedOutside.current = isOutside(event.clientX, event.clientY);
  }

  function handleClick(event: React.MouseEvent) {
    if (!pressedOutside.current) return;
    // A keyboard-triggered click reports 0,0 and must not count as "outside".
    if (event.detail === 0) return;

    /*
      `onClose()`, not `el.close()`. Closing the element directly leaves React
      still believing the sheet is open — it only finds out via the `close` event —
      and the effect above then has nothing to do, so reopening does nothing at
      all. Telling React first keeps one source of truth: state closes the dialog,
      never the other way around.
    */
    if (isOutside(event.clientX, event.clientY)) onClose();
  }

  return (
    /*
      One element, two presentations. A bottom sheet on a phone; on desktop the
      prototype's right-edge panel, so the list you were reading stays visible
      beside what you are editing rather than being blacked out by a modal.

      It stays a `<dialog>` on both sides: `showModal()` gives focus trapping,
      Escape-to-close and inertness for free, and hand-rolling those is exactly
      the thing that ends up half-done. Only the geometry changes.
    */
    <dialog
      ref={ref}
      onClose={onClose}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
      className="m-0 mt-auto w-full max-w-[440px] overflow-y-auto rounded-t-2xl bg-[#141A16] p-4
            text-[#E8EFE9] backdrop:bg-black/60
            md:mt-0 md:mr-0 md:mb-0 md:ml-auto md:h-dvh md:max-h-none md:w-[372px]
            md:max-w-none md:rounded-none md:border-l md:border-[#28322B] md:p-5"
    >
      {children}
    </dialog>
  );
}
