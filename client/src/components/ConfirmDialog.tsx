import { useCallback, useRef, useState } from 'react';
import { Dialog } from './Dialog';

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

/**
 * דיאלוג אישור מעוצב במקום `confirm()` הנייטיב של הדפדפן.
 * מחזיר `confirm(opts)` שמחזיר Promise<boolean>, ואת האלמנט לרינדור.
 */
export function useConfirm() {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback(
    (o: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        resolver.current = resolve;
        setOpts(o);
      }),
    [],
  );

  const settle = (v: boolean) => {
    resolver.current?.(v);
    resolver.current = null;
    setOpts(null);
  };

  const element = opts ? (
    <Dialog onClose={() => settle(false)} ariaLabel={opts.title} modalClass="popup-modal confirm-modal">
      <div className="confirm-body">
        <h3 className="confirm-title">{opts.title}</h3>
        <p className="confirm-message">{opts.message}</p>
        <div className="chat-report-actions">
          <button
            className={`btn btn-sm ${opts.danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={() => settle(true)}
          >
            {opts.confirmLabel ?? 'אישור'}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => settle(false)}>
            {opts.cancelLabel ?? 'ביטול'}
          </button>
        </div>
      </div>
    </Dialog>
  ) : null;

  return { confirm, element };
}
