import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

export type View = 'search' | 'admin';

interface ToastState {
  message: string;
  kind: 'ok' | 'error' | 'info';
}

interface AppState {
  view: View;
  setView: (v: View) => void;
  adminToken: string;
  setAdminToken: (t: string) => void;
  toast: ToastState | null;
  showToast: (message: string, kind?: ToastState['kind']) => void;
}

const AppContext = createContext<AppState | null>(null);

const TOKEN_KEY = 'shikum_admin_token';

export function AppProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<View>('search');
  const [adminToken, setAdminTokenState] = useState<string>(
    () => localStorage.getItem(TOKEN_KEY) || '',
  );
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<number>();

  const setAdminToken = useCallback((t: string) => {
    setAdminTokenState(t);
    localStorage.setItem(TOKEN_KEY, t);
  }, []);

  const showToast = useCallback((message: string, kind: ToastState['kind'] = 'info') => {
    setToast({ message, kind });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), 3500);
  }, []);

  return (
    <AppContext.Provider
      value={{ view, setView, adminToken, setAdminToken, toast, showToast }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
