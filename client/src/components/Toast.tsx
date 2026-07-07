import { useApp } from '../state/AppContext';

export function Toast() {
  const { toast } = useApp();
  if (!toast) return null;
  return <div className={`toast ${toast.kind}`}>{toast.message}</div>;
}
