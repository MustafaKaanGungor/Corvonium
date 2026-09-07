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
      className="m-0 mt-auto w-full max-w-[440px] overflow-y-auto rounded-t-2xl bg-[#141A16] p-4
            text-[#E8EFE9] backdrop:bg-black/60
            md:mt-0 md:mr-0 md:mb-0 md:ml-auto md:h-dvh md:max-h-none md:w-[372px]
            md:max-w-none md:rounded-none md:border-l md:border-[#28322B] md:p-5"
    >
      {children}
    </dialog>
  );
}
