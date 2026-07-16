import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { AiResult, MaktGroup, Supplier, Variant } from '../api/types';
import { useApp } from '../state/AppContext';
import { Breadcrumbs } from './Header';
import { DetailPanel } from './DetailPanel';
import { Highlight } from './Highlight';
import { Icon } from './icons';

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

type Mode = 'exact' | 'smart';

/** צורת קבוצה מאוחדת לשני מצבי החיפוש (מדויק / חכם). */
interface UniGroup {
  catalogNumber: string;
  description: string | null;
  variant_count: number;
  supplier_count: number;
  variants: Variant[];
  match_type?: 'exact_code' | 'text';
  nearest_supplier?: Supplier | null;
}

interface Meta {
  count: number;
  explanation?: string | null;
  location?: string | null;
}

function fromMaktGroup(g: MaktGroup): UniGroup {
  return {
    catalogNumber: g.catalogNumber,
    description: g.description,
    variant_count: g.variant_count,
    supplier_count: g.supplier_count,
    variants: g.variants,
  };
}

function fromAiResult(r: AiResult): UniGroup {
  return {
    catalogNumber: r.catalogNumber,
    description: r.description,
    variant_count: r.variant_count,
    supplier_count: r.supplier_count,
    variants: r.variants,
    match_type: r.match_type,
    nearest_supplier: r.nearest_supplier,
  };
}

export function SearchView() {
  const { showToast, openVariant, searchQuery } = useApp();
  const [q, setQ] = useState('');
  const [mode, setMode] = useState<Mode>('exact');
  const [match, setMatch] = useState('contains');
  const [field, setField] = useState('all');
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState<UniGroup[] | null>(null);
  const [meta, setMeta] = useState<Meta>({ count: 0 });
  const [searchedQuery, setSearchedQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [suggests, setSuggests] = useState<string[]>([]);
  const lastInjected = useRef<string | null>(null);
  const suggestTimer = useRef<number>();
  const suggestSeq = useRef(0);

  // שאילתה שהוזרקה מ-deep-link (למשל מהעוזר החכם) — ממלאת ומריצה מיד (במצב מדויק).
  useEffect(() => {
    if (searchQuery && searchQuery !== lastInjected.current) {
      lastInjected.current = searchQuery;
      setQ(searchQuery);
      search(searchQuery, 'exact');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  function onQueryChange(value: string) {
    setQ(value);
    window.clearTimeout(suggestTimer.current);
    const v = value.trim();
    if (v.length < 2) {
      setSuggests([]);
      return;
    }
    const seq = ++suggestSeq.current;
    suggestTimer.current = window.setTimeout(async () => {
      const r = await api.suggest(v);
      if (seq === suggestSeq.current) setSuggests(r);
    }, 200);
  }

  async function search(queryArg?: string, modeArg?: Mode) {
    const useMode = modeArg ?? mode;
    const term = (queryArg ?? q).trim();
    window.clearTimeout(suggestTimer.current);
    suggestSeq.current++;
    setSuggests([]);
    if (!term) {
      showToast('הקלד ערך לחיפוש', 'error');
      return;
    }
    setLoading(true);
    setSelected(null);
    try {
      let uni: UniGroup[];
      if (useMode === 'smart') {
        const data = await api.aiSearch(term);
        uni = data.results.map(fromAiResult);
        setMeta({ count: data.count, explanation: data.parsed.explanation, location: data.user_location });
        if (!data.count) showToast(data.message || 'לא נמצאו תוצאות', 'info');
      } else {
        const data = await api.searchItems({ q: term, match, field });
        uni = (data.groups || []).map(fromMaktGroup);
        setMeta({ count: data.group_count ?? 0 });
      }
      setGroups(uni);
      setSearchedQuery(term);
      setExpanded(new Set(uni.slice(0, 1).map((g) => g.catalogNumber)));
    } catch (e) {
      setGroups([]);
      setMeta({ count: 0 });
      const is404 = e instanceof ApiError && e.status === 404;
      showToast(e instanceof ApiError ? e.message : 'שגיאה בחיפוש', is404 ? 'info' : 'error');
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

  const exportHref =
    groups && meta.count > 0
      ? mode === 'smart'
        ? api.exportAiUrl(searchedQuery)
        : api.exportSearchUrl({ q: searchedQuery, match, field })
      : null;

  return (
    <>
      <Breadcrumbs trail={['דף הבית', 'חיפוש מק"טים וספקים']} />
      <main>
        <section className="card">
          <div className="mode-toggle" role="tablist" aria-label="מצב חיפוש">
            <button
              role="tab"
              aria-selected={mode === 'exact'}
              className={mode === 'exact' ? 'active' : ''}
              onClick={() => setMode('exact')}
            >
              <Icon name="search" /> חיפוש מדויק
            </button>
            <button
              role="tab"
              aria-selected={mode === 'smart'}
              className={mode === 'smart' ? 'active' : ''}
              onClick={() => setMode('smart')}
            >
              <Icon name="sparkles" /> חיפוש חכם (AI)
            </button>
          </div>

          <div className="search-row">
            <div className="field grow search-field">
              <label>{mode === 'smart' ? 'תיאור חופשי' : 'חיפוש'}</label>
              <input
                value={q}
                onChange={(e) => onQueryChange(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && search()}
                onBlur={() => window.setTimeout(() => setSuggests([]), 120)}
                placeholder={
                  mode === 'smart'
                    ? 'לדוגמה: כיסא גלגלים בבאר שבע'
                    : 'מק"ט, תיאור פריט, שם ספק…'
                }
                type="search"
              />
              {suggests.length > 0 && (
                <div className="autocomplete">
                  {suggests.map((s) => (
                    <button
                      key={s}
                      className="ac-item"
                      title={s}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setQ(s);
                        search(s);
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {mode === 'exact' && (
              <>
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
              </>
            )}
            <button className="btn btn-primary" onClick={() => search()} disabled={loading}>
              {loading ? <span className="spinner" /> : 'חפש'}
            </button>
            {exportHref && (
              <a className="btn btn-green" href={exportHref}>
                <Icon name="download" /> ייצוא Excel
              </a>
            )}
          </div>
          <p className="hint">
            {mode === 'smart'
              ? 'תאר במילים חופשיות מה נדרש ואיפה — המערכת תמצא מק"טים ותדרג ספקים לפי קרבה.'
              : 'בחירת שורת מק"ט מרחיבה את הווריאנטים · בחירת וריאנט מציגה פרטים וספקים בצד.'}
          </p>
        </section>

        <div className="workspace">
          <section className="card">
            <div className="panel-head">
              <h2>תוצאות חיפוש</h2>
              <span className="count-pill">{groups ? `${meta.count} מק"טים` : '0'}</span>
            </div>
            {mode === 'smart' && meta.explanation && groups && groups.length > 0 && (
              <p className="hint" style={{ marginTop: 0 }}>
                {meta.explanation}
                {meta.location ? ` · מיקום: ${meta.location}` : ''}
              </p>
            )}
            {loading && !groups && <ResultsSkeleton />}
            {!loading && !groups && <p className="empty-state">בצע חיפוש כדי להציג תוצאות</p>}
            {groups && groups.length === 0 && <p className="empty-state">לא נמצאו תוצאות</p>}
            {groups?.map((g) => {
              const isOpen = expanded.has(g.catalogNumber);
              const isSelected = g.variants.some((v) => v.entityId === selected);
              return (
                <div className={`result-group${isSelected ? ' selected' : ''}`} key={g.catalogNumber}>
                  <button
                    className="group-head"
                    aria-expanded={isOpen}
                    onClick={() => toggle(g.catalogNumber)}
                  >
                    <span className="makt-badge">{g.catalogNumber}</span>
                    <span className="group-title">
                      <Highlight text={g.description || '—'} query={searchedQuery} />
                    </span>
                    <div className="group-meta">
                      {g.match_type === 'exact_code' && (
                        <span className="chip exact" title="קוד ההפניה מוביל ישירות לשירות זה">
                          <Icon name="check" /> התאמה מדויקת
                        </span>
                      )}
                      {g.variants[0]?.catalogPricelistNum && (
                        <span className="chip amber">קוד שירות: {g.variants[0].catalogPricelistNum}</span>
                      )}
                      <span className="chip">{g.variant_count} וריאנטים</span>
                      <span className="chip green">{g.supplier_count} ספקים</span>
                      <Icon name={isOpen ? 'chevron-up' : 'chevron-down'} className="chevron" />
                    </div>
                  </button>
                  {isOpen &&
                    g.variants.map((v) => (
                      <div
                        className={`variant-row${v.entityId === selected ? ' active' : ''}`}
                        key={v.entityId}
                        onClick={() => setSelected(v.entityId)}
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
                          <Icon name="external" /> פתח בעמוד
                        </button>
                      </div>
                    ))}
                </div>
              );
            })}
          </section>

          <div>
            <DetailPanel entityId={selected} />
          </div>
        </div>
      </main>
    </>
  );
}

function ResultsSkeleton() {
  return (
    <div className="skeleton-list" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <div className="skeleton-row" key={i}>
          <span className="sk sk-badge" />
          <span className="sk sk-line" />
          <span className="sk sk-chip" />
        </div>
      ))}
    </div>
  );
}
