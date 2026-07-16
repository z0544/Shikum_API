import { useApp } from '../state/AppContext';
import { Icon } from './icons';

export function Header() {
  const { view, setView, theme, toggleTheme, goHome } = useApp();
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
          <button className={view === 'variant' ? 'active' : ''} onClick={() => setView('variant')}>
            תצוגת וריאנט
          </button>
          <button className={view === 'admin' ? 'active' : ''} onClick={() => setView('admin')}>
            ניהול וטעינת נתונים
          </button>
        </nav>
        <button
          className="theme-toggle"
          onClick={toggleTheme}
          title={theme === 'dark' ? 'מצב בהיר' : 'מצב כהה'}
          aria-label={theme === 'dark' ? 'עבור למצב בהיר' : 'עבור למצב כהה'}
        >
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
        </button>
        <button className="home-box" title="דף הבית (איפוס)" aria-label="דף הבית" onClick={goHome}>
          <Icon name="home" />
        </button>
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
