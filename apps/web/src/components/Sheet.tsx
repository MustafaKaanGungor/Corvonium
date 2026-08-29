import { useEffect, useRef, type ReactNode } from 'react';

type Props = {
    open: boolean;
    onClose: () => void;
    children: ReactNode;
};

export function Sheet({open, onClose, children}: Props) {
    const ref = useRef<HTMLDialogElement>(null);

    useEffect(() => {
        const el = ref.current;
        if(!el) return;
        if(open && !el.open) el.showModal();
        if(!open && el.open) el.close();
    }, [open]);

    return (
        <dialog
            ref={ref}
            onClose={onClose}
            className='m-0 mt-auto w-full max-w-[440px] rounded-t-2xl bg-[#141A16] p-4 
            text-[#E8EFE9] backdrop:bg-black/60 sm:mx-auto sm:mb-auto sm:rounded-2xl'>
                {children}
            </dialog>
    );
}