import { Header } from './components/Header';
import { SearchView } from './components/SearchView';
import { VariantView } from './components/VariantView';
import { AdminView } from './components/AdminView';
import { ApiView } from './components/ApiView';
import { Toast } from './components/Toast';
import { ChatBot } from './components/ChatBot';
import { VariantDialog } from './components/VariantDialog';
import { useApp } from './state/AppContext';

export function App() {
  const { view, popupVariant } = useApp();
  return (
    <div className="app">
      <a href="#maincontent" className="skip-link">
        דלג לתוכן הראשי
      </a>
      <Header />
      {/* SearchView נשאר מותקן (מוסתר) כדי לשמר תוצאות/בחירה במעבר בין מסכים וחזרה */}
      <div hidden={view !== 'search'}>
        <SearchView active={view === 'search'} />
      </div>
      {view === 'variant' && <VariantView />}
      {view === 'api' && <ApiView />}
      {view === 'admin' && <AdminView />}
      <Toast />
      <ChatBot />
      {popupVariant && <VariantDialog entityId={popupVariant} />}
    </div>
  );
}
