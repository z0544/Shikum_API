import { Header } from './components/Header';
import { SearchView } from './components/SearchView';
import { AdminView } from './components/AdminView';
import { Toast } from './components/Toast';
import { useApp } from './state/AppContext';

export function App() {
  const { view } = useApp();
  return (
    <div className="app">
      <Header />
      {view === 'search' ? <SearchView /> : <AdminView />}
      <Toast />
    </div>
  );
}
