import { useState } from 'react';
import { api, ApiError } from '../api/client';
import type { SearchResponse, Supplier } from '../api/types';
import { useApp } from '../state/AppContext';
import { Breadcrumbs } from './Header';
import { SmartSearch } from './SmartSearch';
import { DetailPanel } from './DetailPanel';
import { SuppliersPanel } from './SuppliersPanel';

const MATCH_OPTS = [
  ['contains', 'מכיל'],
  ['startswith', 'מתחיל ב-'],
  ['endswith', 'מסתיים ב-'],
  ['exact', 'שווה'],
];
const FIELD_OPTS = [
  ['all', 'הכל'],
  ['מקט', 'מק"ט'],
  ['תיאור', 'תיאור'],
  ['מחירון', 'קוד שירות'],
  ['זכאי', 'סוג זכאי'],
  ['ספק', 'שם ספק'],
  ['entity_id', 'מזהה וריאנט'],
];

export function SearchView() {
  const { showToast, openVariant } = useApp();
  const [q, setQ] = useState('');
  const [match, setMatch] = useState('contains');
  const [field, setField] = useState('all');
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<SearchResponse | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [openSuppliers, setOpenSuppliers] = useState<Set<string>>(new Set());
  const [maktSuppliers, setMaktSuppliers] = useState<Record<string, Supplier[]>>({});
  const [loadingSuppliers, setLoadingSuppliers] = useState<Set<string>>(new Set());

  async function search() {
    if (!q.trim()) {
      showToast('הקלד ערך לחיפוש', 'error');
      return;
    }
    setLoading(true);
    setSelected(null);
    setOpenSuppliers(new Set());
    setMaktSuppliers({});
    try {
      const data = await api.searchItems({ q: q.trim(), match, field });
      setRes(data);
      // הרחבת המק"ט הראשון אוטומטית
      setExpanded(new Set(data.groups?.slice(0, 1).map((g) => g.catalogNumber)));
    } catch (e) {
      setRes(null);
      showToast(e instanceof ApiError ? e.message : 'שגיאה בחיפוש', e instanceof ApiError && e.status === 404 ? 'info' : 'error');
    } finally {
      setLoading(false);
    }
  }

  function toggle(makt: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(makt) ? next.delete(makt) : next.add(makt);
      return next;
    });
  }

  async function toggleSuppliers(makt: string) {
    const wasOpen = openSuppliers.has(makt);
    setOpenSuppliers((prev) => {
      const next = new Set(prev);
      next.has(makt) ? next.delete(makt) : next.add(makt);
      return next;
    });
    // טעינה עצלה של הספקים למק"ט (פעם אחת) בעת פתיחה.
    if (!wasOpen && !maktSuppliers[makt]) {
      setLoadingSuppliers((prev) => new Set(prev).add(makt));
      try {
        const data = await api.getMaktSuppliers(makt);
        setMaktSuppliers((prev) => ({ ...prev, [makt]: data.suppliers }));
      } catch (e) {
        showToast(e instanceof ApiError ? e.message : 'שגיאה בטעינת ספקים', 'error');
        setOpenSuppliers((prev) => {
          const next = new Set(prev);
          next.delete(makt);
          return next;
        });
      } finally {
        setLoadingSuppliers((prev) => {
          const next = new Set(prev);
          next.delete(makt);
          return next;
        });
      }
    }
  }

  const groups = res?.groups || [];

  return (
    <>
      <Breadcrumbs trail={['דף הבית', 'חיפוש מק"טים וספקים']} />
      <main>
        <section className="card">
          <div className="search-row">
            <div className="field grow">
              <label>חיפוש</label>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && search()}
                placeholder='מק"ט, תיאור פריט, שם ספק…'
                type="search"
              />
            </div>
            <div className="field">
              <label>התאמה</label>
              <select value={match} onChange={(e) => setMatch(e.target.value)}>
                {MATCH_OPTS.map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>שדה</label>
              <select value={field} onChange={(e) => setField(e.target.value)}>
                {FIELD_OPTS.map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <button className="btn btn-primary" onClick={search} disabled={loading}>
              {loading ? <span className="spinner" /> : 'חפש'}
            </button>
            {res && res.count > 0 && (
              <a className="btn btn-green" href={api.exportSearchUrl({ q: q.trim(), match, field })}>
                ⬇ ייצוא Excel
              </a>
            )}
          </div>
          <p className="hint">בחירת שורת מק"ט מרחיבה את הווריאנטים · לחיצה על וריאנט מציגה פרטים וספקים בצד</p>
        </section>

        <SmartSearch onSelect={setSelected} />

        <div className="workspace">
          <section className="card">
            <div className="panel-head">
              <h2>תוצאות חיפוש</h2>
              <span className="count-pill">{res ? `${res.group_count ?? 0} מק"טים` : '0'}</span>
            </div>
            {!res && <p className="empty-state">בצע חיפוש כדי להציג תוצאות</p>}
            {res && groups.length === 0 && <p className="empty-state">לא נמצאו תוצאות</p>}
            {groups.map((g) => (
              <div
                className={`result-group${
                  g.variants.some((v) => v.entityId === selected) ? ' selected' : ''
                }`}
                key={g.catalogNumber}
              >
                <div className="group-head" onClick={() => toggle(g.catalogNumber)}>
                  <span className="makt-badge">{g.catalogNumber}</span>
                  <span className="group-title">{g.description || '—'}</span>
                  <div className="group-meta">
                    {g.variants[0]?.catalogPricelistNum && (
                      <span className="chip amber">קוד שירות: {g.variants[0].catalogPricelistNum}</span>
                    )}
                    <span className="chip">{g.variant_count} וריאנטים</span>
                    <span className="chip green">{g.supplier_count} ספקים</span>
                    <span className="chip">{expanded.has(g.catalogNumber) ? '▲' : '▼'}</span>
                  </div>
                </div>
                {expanded.has(g.catalogNumber) && (
                  <>
                    {g.variants.map((v) => (
                      <div
                        className="variant-row"
                        key={v.entityId}
                        onClick={() => setSelected(v.entityId)}
                        style={v.entityId === selected ? { background: '#cfe0fb' } : undefined}
                      >
                        <span className="vid">{v.entityId}</span>
                        <span className="spacer" />
                        {v.entitledTypeRaw && v.entitledTypeRaw !== 'לא מוגדר' && (
                          <span className="chip">{v.entitledTypeRaw}</span>
                        )}
                        {v.amount && v.amount !== 'לא מוגדר' && (
                          <span className="chip green">₪ {v.amount}</span>
                        )}
                        <button
                          className="variant-open"
                          title="פתח בעמוד וריאנט ייעודי (ניתן לשיתוף)"
                          onClick={(e) => {
                            e.stopPropagation();
                            openVariant(v.entityId);
                          }}
                        >
                          ↗ פתח בעמוד
                        </button>
                      </div>
                    ))}
                    {g.supplier_count > 0 && (
                      <div className="variant-row" style={{ cursor: 'default' }}>
                        <button
                          className="variant-open"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSuppliers(g.catalogNumber);
                          }}
                        >
                          {openSuppliers.has(g.catalogNumber)
                            ? '▲ הסתר ספקים'
                            : `▼ הצג ספקים מורשים (${g.supplier_count})`}
                        </button>
                        {loadingSuppliers.has(g.catalogNumber) && <span className="spinner" />}
                      </div>
                    )}
                    {openSuppliers.has(g.catalogNumber) && maktSuppliers[g.catalogNumber] && (
                      <div className="smart-suppliers">
                        <SuppliersPanel
                          key={g.catalogNumber}
                          suppliers={maktSuppliers[g.catalogNumber]}
                        />
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </section>

          <div>
            <DetailPanel entityId={selected} />
          </div>
        </div>
      </main>
    </>
  );
}
