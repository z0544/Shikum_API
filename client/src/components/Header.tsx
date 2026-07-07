import { useApp } from '../state/AppContext';

export function Header() {
  const { view, setView } = useApp();
  return (
    <header className="header">
      <div className="header-bar">
        <div className="brand">
          <span className="brand-badge">◈</span>
          <span>מערכת שיקום</span>
        </div>
        <nav className="nav">
          <button className={view === 'search' ? 'active' : ''} onClick={() => setView('search')}>
            חיפוש מק"טים
          </button>
          <button className={view === 'admin' ? 'active' : ''} onClick={() => setView('admin')}>
            ניהול וטעינת נתונים
          </button>
        </nav>
        <div className="home-box" title="דף הבית" onClick={() => setView('search')}>
          ⌂
        </div>
      </div>
    </header>
  );
}

export function Breadcrumbs({ trail }: { trail: string[] }) {
  return (
    <div className="breadcrumbs">
      <div>
        {trail.map((t, i) => (
          <span key={i}>
            {i > 0 && ' / '}
            {i === trail.length - 1 ? <b>{t}</b> : t}
          </span>
        ))}
      </div>
    </div>
  );
}
