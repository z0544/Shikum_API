import { useEffect, useRef } from 'react';

/**
 * ניהול נגישות בסיסי לחלון קופץ (modal): מיקוד ראשוני על החלון, סגירה במקש Escape,
 * והחזרת הפוקוס לאלמנט שממנו נפתח בעת הסגירה. יש להצמיד את ה-ref המוחזר לאלמנט
 * החלון (עם tabIndex={-1} כדי שיוכל לקבל פוקוס).
 */
export function useDialogDismiss<T extends HTMLElement>(onClose: () => void) {
  const ref = useRef<T>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previouslyFocused?.focus?.();
    };
  }, []);

  return ref;
}
