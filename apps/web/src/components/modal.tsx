import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

export interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/** Backdrop dialog that closes on Escape, backdrop click or the close button. */
export function Modal({ title, onClose, children }: ModalProps): JSX.Element {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    // Stops the page behind the dialog from scrolling with it.
    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-3xl overflow-hidden rounded-xl bg-white shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <button
            ref={closeRef}
            type="button"
            className="btn-secondary"
            onClick={onClose}
          >
            Kapat
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
