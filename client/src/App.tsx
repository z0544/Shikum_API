import { Header } from './components/Header';
import { SearchView } from './components/SearchView';
import { VariantView } from './components/VariantView';
import { AdminView } from './components/AdminView';
import { Toast } from './components/Toast';
import { ChatBot } from './components/ChatBot';
import { VariantDialog } from './components/VariantDialog';
import { useApp } from './state/AppContext';

export function App() {
  const { view, popupVariant } = useApp();
  return (
    <div className="app">
      <Header />
      {view === 'search' ? <SearchView /> : view === 'variant' ? <VariantView /> : <AdminView />}
      <Toast />
      <ChatBot />
      {popupVariant && <VariantDialog entityId={popupVariant} />}
    </div>
  );
}
