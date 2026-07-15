import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export type View = 'search' | 'admin' | 'variant';

interface ToastState {
  message: string;
  kind: 'ok' | 'error' | 'info';
}

interface Route {
  view: View;
  /** מזהה הווריאנט להצגה (רק כאשר view === 'variant'). */
  variantId: string | null;
  /** שאילתת חיפוש נכנסת מ-deep-link (רק כאשר view === 'search'). */
  searchQuery: string | null;
}

interface AppState {
  view: View;
  /** מזהה הווריאנט הפעיל בתצוגת הווריאנט הייעודית (deep-link). */
  variantId: string | null;
  /** שאילתה שהוזרקה לעמוד החיפוש (למשל מהעוזר החכם). */
  searchQuery: string | null;
  setView: (v: View) => void;
  /** מעבר לתצוגת וריאנט בודד ייעודית (מעדכן את ה-URL לשיתוף). */
  openVariant: (entityId: string) => void;
  /** מעבר לעמוד החיפוש והרצת שאילתה נתונה (מק"ט/טקסט) — לשיתוף מהצ'אט. */
  openSearch: (query: string) => void;
  adminToken: string;
  setAdminToken: (t: string) => void;
  toast: ToastState | null;
  showToast: (message: string, kind?: ToastState['kind']) => void;
}

const AppContext = createContext<AppState | null>(null);

const TOKEN_KEY = 'shikum_admin_token';

/** פענוח ה-hash ל-route. פורמט: #/search · #/admin · #/variant · #/variant/<entityId>. */
function parseHash(): Route {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const [seg, ...rest] = raw.split('/');
  if (seg === 'variant') {
    return {
      view: 'variant',
      variantId: rest.length ? decodeURIComponent(rest.join('/')) : null,
      searchQuery: null,
    };
  }
  if (seg === 'admin') return { view: 'admin', variantId: null, searchQuery: null };
  return {
    view: 'search',
    variantId: null,
    searchQuery: rest.length ? decodeURIComponent(rest.join('/')) : null,
  };
}

/** בניית ה-hash מתוך view + ארגומנט אופציונלי (מזהה וריאנט / שאילתת חיפוש). */
function hashFor(view: View, arg?: string | null): string {
  if (view === 'admin') return '#/admin';
  if (view === 'variant') {
    return arg ? `#/variant/${encodeURIComponent(arg)}` : '#/variant';
  }
  return arg ? `#/search/${encodeURIComponent(arg)}` : '#/search';
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState<Route>(parseHash);
  const [adminToken, setAdminTokenState] = useState<string>(
    () => localStorage.getItem(TOKEN_KEY) || '',
  );
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<number>();

  // ה-hash הוא מקור האמת היחיד לניווט — כל שינוי בו מסונכרן ל-state.
  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    if (!window.location.hash) window.history.replaceState(null, '', hashFor('search'));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const setView = useCallback((v: View) => {
    window.location.hash = hashFor(v);
  }, []);

  const openVariant = useCallback((entityId: string) => {
    window.location.hash = hashFor('variant', entityId);
  }, []);

  const openSearch = useCallback((query: string) => {
    window.location.hash = hashFor('search', query);
  }, []);

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
      value={{
        view: route.view,
        variantId: route.variantId,
        searchQuery: route.searchQuery,
        setView,
        openVariant,
        openSearch,
        adminToken,
        setAdminToken,
        toast,
        showToast,
      }}
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
