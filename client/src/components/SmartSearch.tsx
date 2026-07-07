import { useState } from 'react';
import { api, ApiError } from '../api/client';
import type { AiSearchResponse } from '../api/types';
import { useApp } from '../state/AppContext';

export function SmartSearch({ onSelect }: { onSelect: (entityId: string) => void }) {
  const { showToast } = useApp();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<AiSearchResponse | null>(null);

  async function run() {
    if (query.trim().length < 3) {
      showToast('הקלד לפחות 3 תווים', 'error');
      return;
    }
    setLoading(true);
    try {
      const data = await api.aiSearch(query.trim());
      setRes(data);
      if (data.count === 0) showToast(data.message || 'לא נמצאו תוצאות', 'info');
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'שגיאה בחיפוש החכם', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card smart-card">
      <div className="panel-head">
        <div className="smart-title">
          <span className="tag">AI</span>
          <h2 style={{ margin: 0 }}>חיפוש חכם בשפה חופשית</h2>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen((o) => !o)}>
          {open ? 'סגור' : 'פתח'}
        </button>
      </div>
      {open && (
        <>
          <p className="hint" style={{ marginTop: 0 }}>
            תאר במילים חופשיות מה נדרש ואיפה — לדוגמה: "כיסא גלגלים, גר בבאר שבע". המערכת תמצא מק"טים ותדרג ספקים לפי קרבה.
          </p>
          <div className="search-row">
            <div className="field grow">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && run()}
                placeholder="לדוגמה: עדשות מולטיפוקל בחיפה"
              />
            </div>
            <button className="btn btn-green" onClick={run} disabled={loading}>
              {loading ? <span className="spinner" /> : 'חפש חכם'}
            </button>
            {res && res.count > 0 && (
              <a className="btn btn-ghost" href={api.exportAiUrl(query.trim())}>
                ⬇ ייצוא
              </a>
            )}
          </div>

          {res && res.count > 0 && (
            <>
              <p className="hint">
                {res.parsed.explanation}
                {res.user_location ? ` · מיקום: ${res.user_location}` : ''}
              </p>
              {res.results.map((r) => (
                <div className="result-group" key={r.catalogNumber}>
                  <div
                    className="group-head"
                    onClick={() => r.variants[0] && onSelect(r.variants[0].entityId)}
                  >
                    <span className="makt-badge">{r.catalogNumber}</span>
                    <span className="group-title">{r.description || '—'}</span>
                    <div className="group-meta">
                      <span className="chip">{r.variant_count} וריאנטים</span>
                      <span className="chip green">{r.supplier_count} ספקים</span>
                    </div>
                  </div>
                  {r.nearest_supplier && (
                    <div className="variant-row" style={{ cursor: 'default' }}>
                      <span className="nearest-tag">ספק קרוב</span>
                      <span>{r.nearest_supplier.name}</span>
                      <span className="spacer" />
                      <span className="chip">{r.nearest_supplier.city}</span>
                      <span className="chip green">{r.nearest_supplier.proximity_label}</span>
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </>
      )}
    </section>
  );
}
