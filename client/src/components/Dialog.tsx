import { useEffect, useRef, type ReactNode } from 'react';

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * חלון קופץ (modal) נגיש: מיקוד ראשוני, לכידת Tab בתוך החלון, סגירה ב-Escape או
 * בלחיצה על הרקע, והחזרת הפוקוס לאלמנט שממנו נפתח. משמש את כל המודאלים במערכת.
 */
export function Dialog({
  onClose,
  ariaLabel,
  overlayClass = 'popup-overlay',
  modalClass = 'popup-modal',
  children,
}: {
  onClose: () => void;
  ariaLabel: string;
  overlayClass?: string;
  modalClass?: string;
  children: ReactNode;
}) {
  const modalRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const modal = modalRef.current;
    const focusables = () =>
      modal
        ? [...modal.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null)
        : [];
    (focusables()[0] ?? modal)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key === 'Tab' && modal) {
        const f = focusables();
        if (f.length === 0) {
          e.preventDefault();
          modal.focus();
          return;
        }
        const first = f[0];
        const last = f[f.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && (active === first || active === modal)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      previouslyFocused?.focus?.();
    };
  }, []);

  return (
    <div className={overlayClass} onClick={onClose}>
      <div
        ref={modalRef}
        tabIndex={-1}
        className={modalClass}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
