import { useApp } from '../state/AppContext';
import { Icon } from './icons';

export function Header() {
  const { view, setView, theme, toggleTheme, goHome } = useApp();
  return (
    <header className="header">
      <div className="header-bar">
        <div className="brand">
          <span className="brand-badge" aria-hidden="true">
            <Icon name="logo" />
          </span>
          <span>מערכת שיקום</span>
        </div>
        <nav className="nav" aria-label="ניווט ראשי">
          <button
            className={view === 'search' ? 'active' : ''}
            aria-current={view === 'search' ? 'page' : undefined}
            onClick={() => setView('search')}
          >
            חיפוש מק"טים
          </button>
          <button
            className={view === 'variant' ? 'active' : ''}
            aria-current={view === 'variant' ? 'page' : undefined}
            onClick={() => setView('variant')}
          >
            תצוגת וריאנט
          </button>
          <button
            className={view === 'admin' ? 'active' : ''}
            aria-current={view === 'admin' ? 'page' : undefined}
            onClick={() => setView('admin')}
          >
            ניהול וטעינת נתונים
          </button>
          <button
            className={view === 'api' ? 'active' : ''}
            aria-current={view === 'api' ? 'page' : undefined}
            onClick={() => setView('api')}
          >
            API
          </button>
        </nav>
        <div className="header-actions">
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
      </div>
    </header>
  );
}

export function Breadcrumbs({ trail }: { trail: string[] }) {
  const { goHome } = useApp();
  return (
    <nav className="breadcrumbs" aria-label="מיקום">
      <div>
        {trail.map((t, i) => {
          const isLast = i === trail.length - 1;
          return (
            <span key={i}>
              {i > 0 && <span className="crumb-sep"> / </span>}
              {i === 0 ? (
                <button className="crumb-link" onClick={goHome}>
                  {t}
                </button>
              ) : isLast ? (
                <b aria-current="page">{t}</b>
              ) : (
                t
              )}
            </span>
          );
        })}
      </div>
    </nav>
  );
}
