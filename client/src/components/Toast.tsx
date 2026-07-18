import { useApp } from '../state/AppContext';
import { Icon } from './icons';

export function Toast() {
  const { toast, dismissToast } = useApp();
  if (!toast) return null;
  const isError = toast.kind === 'error';
  return (
    <div
      className={`toast ${toast.kind}`}
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
    >
      <span className="toast-msg">{toast.message}</span>
      <button className="toast-close" onClick={dismissToast} aria-label="סגור">
        <Icon name="close" />
      </button>
    </div>
  );
}
