import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { AiResult, MaktGroup, Supplier, Variant } from '../api/types';
import { useApp } from '../state/AppContext';
import { Breadcrumbs } from './Header';
import { DetailPanel } from './DetailPanel';
import { Highlight } from './Highlight';
import { Icon } from './icons';
import { Dialog } from './Dialog';
import { useMediaQuery } from '../hooks/useMediaQuery';

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

export function SearchView({ active = true }: { active?: boolean }) {
  const { showToast, openVariant, searchQuery, resetSignal } = useApp();
  const narrow = useMediaQuery('(max-width: 900px)');
  const [q, setQ] = useState('');
  const [mode, setMode] = useState<Mode>('exact');
  const [match, setMatch] = useState('contains');
  const [field, setField] = useState('all');
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState<UniGroup[] | null>(null);
  const [meta, setMeta] = useState<Meta>({ count: 0 });
  const [searchedQuery, setSearchedQuery] = useState('');
  // הפרמטרים שבהם רצה החיפוש הנוכחי — כדי שקישור הייצוא יתאים לתוצאות המוצגות
  // גם אם המשתמש שינה את המצב/השדה מבלי לחפש מחדש.
  const [resultParams, setResultParams] = useState<{ mode: Mode; match: string; field: string } | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [limit, setLimit] = useState(100);
  const [suggests, setSuggests] = useState<string[]>([]);
  const [acIndex, setAcIndex] = useState(-1);
  const [showCurl, setShowCurl] = useState(false);
  const lastInjected = useRef<string | null>(null);
  const suggestTimer = useRef<number>();
  const suggestSeq = useRef(0);

  // "דף הבית" — איפוס מלא של דף החיפוש.
  useEffect(() => {
    if (resetSignal === 0) return;
    setQ('');
    setMode('exact');
    setGroups(null);
    setMeta({ count: 0 });
    setSearchedQuery('');
    setResultParams(null);
    setExpanded(new Set());
    setSelected(null);
    setSuggests([]);
    lastInjected.current = null;
  }, [resetSignal]);

  // שאילתה שהוזרקה מ-deep-link (למשל מהעוזר החכם) — ממלאת ומריצה מיד (במצב מדויק).
  useEffect(() => {
    if (searchQuery && searchQuery !== lastInjected.current) {
      lastInjected.current = searchQuery;
      setQ(searchQuery);
      search(searchQuery, mode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  function onQueryChange(value: string) {
    setQ(value);
    setAcIndex(-1);
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

  async function search(queryArg?: string, modeArg?: Mode, limitArg?: number) {
    const useMode = modeArg ?? mode;
    const useLimit = limitArg ?? 100;
    setLimit(useLimit);
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
      let ranMode: Mode = useMode;
      if (useMode === 'smart') {
        const data = await api.aiSearch(term);
        uni = data.results.map(fromAiResult);
        setMeta({ count: data.count, explanation: data.parsed.explanation, location: data.user_location });
        if (!data.count) showToast(data.message || 'לא נמצאו תוצאות', 'info');
      } else {
        try {
          const data = await api.searchItems({ q: term, match, field, limit: useLimit });
          uni = (data.groups || []).map(fromMaktGroup);
          setMeta({ count: data.group_count ?? 0 });
        } catch (e) {
          // נפילה חכמה: אין התאמה מדויקת בחיפוש הרגיל (ברירת המחדל) — מנסים חיפוש חכם,
          // כדי שמונחים כמו "פסיכולוג חינוכי" עדיין יחזירו תוצאות רלוונטיות.
          const noExact = e instanceof ApiError && e.status === 404;
          if (!noExact || match !== 'contains' || field !== 'all') throw e;
          const ai = await api.aiSearch(term);
          uni = ai.results.map(fromAiResult);
          ranMode = 'smart';
          // מיישרים את הטוגל למצב שרץ בפועל, כדי שלא יוצג "מדויק" על תוצאות חכמות
          if (ai.count) setMode('smart');
          setMeta({
            count: ai.count,
            explanation: ai.count
              ? 'לא נמצאו התאמות מדויקות — מוצגות תוצאות חיפוש חכם'
              : null,
            location: ai.user_location,
          });
          if (!ai.count) showToast('לא נמצאו תוצאות', 'info');
        }
      }
      setGroups(uni);
      setSearchedQuery(term);
      setResultParams({ mode: ranMode, match, field });
      setExpanded(new Set(uni.slice(0, 1).map((g) => g.catalogNumber)));
    } catch (e) {
      setGroups([]);
      setMeta({ count: 0 });
      setResultParams(null);
      const is404 = e instanceof ApiError && e.status === 404;
      showToast(e instanceof ApiError ? e.message : 'שגיאה בחיפוש', is404 ? 'info' : 'error');
    } finally {
      setLoading(false);
    }
  }

  function pickSuggestion(s: string) {
    setQ(s);
    setSuggests([]);
    setAcIndex(-1);
    search(s);
  }

  function onSearchKeyDown(e: React.KeyboardEvent) {
    if (suggests.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setAcIndex((i) => (i + 1) % suggests.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setAcIndex((i) => (i <= 0 ? suggests.length - 1 : i - 1));
        return;
      }
      if (e.key === 'Escape') {
        setSuggests([]);
        setAcIndex(-1);
        return;
      }
      if (e.key === 'Enter' && acIndex >= 0 && acIndex < suggests.length) {
        e.preventDefault();
        pickSuggestion(suggests[acIndex]);
        return;
      }
    }
    if (e.key === 'Enter') search();
  }

  function toggle(makt: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(makt) ? next.delete(makt) : next.add(makt);
      return next;
    });
  }

  const exportHref =
    resultParams && meta.count > 0
      ? resultParams.mode === 'smart'
        ? api.exportAiUrl(searchedQuery)
        : api.exportSearchUrl({ q: searchedQuery, match: resultParams.match, field: resultParams.field })
      : null;

  // פקודת cURL לקריאת ה-API של החיפוש הנוכחי — לייחצון/אינטגרציה של מפתחים.
  function buildCurl(): string {
    const origin = window.location.origin;
    if (!resultParams) return '';
    if (resultParams.mode === 'smart') {
      return `curl -X POST '${origin}/api/ai/search' \\\n  -H 'Content-Type: application/json' \\\n  -d '${JSON.stringify({ query: searchedQuery })}'`;
    }
    const qs = new URLSearchParams({
      q: searchedQuery,
      match: resultParams.match,
      field: resultParams.field,
      grouped: 'true',
    });
    return `curl '${origin}/api/items?${qs.toString()}'`;
  }

  function copyCurl() {
    navigator.clipboard
      ?.writeText(buildCurl())
      .then(() => showToast('פקודת cURL הועתקה', 'ok'))
      .catch(() => showToast('לא ניתן להעתיק', 'error'));
  }

  return (
    <>
      <Breadcrumbs trail={['דף הבית', 'חיפוש מק"טים וספקים']} />
      <main id={active ? 'maincontent' : undefined}>
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
              <label id="search-label">{mode === 'smart' ? 'תיאור חופשי' : 'חיפוש'}</label>
              <input
                value={q}
                onChange={(e) => onQueryChange(e.target.value)}
                onKeyDown={onSearchKeyDown}
                onBlur={() => window.setTimeout(() => setSuggests([]), 120)}
                placeholder={
                  mode === 'smart'
                    ? 'לדוגמה: כיסא גלגלים בבאר שבע'
                    : 'מק"ט, תיאור פריט, שם ספק…'
                }
                type="search"
                role="combobox"
                aria-expanded={suggests.length > 0}
                aria-controls="search-ac-list"
                aria-autocomplete="list"
                aria-activedescendant={acIndex >= 0 ? `search-ac-${acIndex}` : undefined}
                aria-labelledby="search-label"
              />
              {suggests.length > 0 && (
                <div className="autocomplete" role="listbox" id="search-ac-list" aria-label="הצעות">
                  {suggests.map((s, i) => (
                    <button
                      key={s}
                      id={`search-ac-${i}`}
                      role="option"
                      aria-selected={i === acIndex}
                      className={`ac-item${i === acIndex ? ' active' : ''}`}
                      title={s}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        pickSuggestion(s);
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
            {resultParams && meta.count > 0 && (
              <button
                className="btn btn-ghost"
                onClick={() => setShowCurl(true)}
                title="הצג את פקודת ה-cURL של קריאת ה-API"
              >
                {'</>'} API / cURL
              </button>
            )}
          </div>
          <p className="hint">
            {mode === 'smart'
              ? 'תאר במילים חופשיות מה נדרש ואיפה — המערכת תמצא מק"טים ותדרג ספקים לפי קרבה.'
              : 'בחירת שורת מק"ט מרחיבה את הווריאנטים · בחירת וריאנט מציגה פרטים וספקים בצד.'}
          </p>
        </section>

        <div className="workspace">
          <section className="card" aria-busy={loading}>
            <div className="panel-head">
              <h2>תוצאות חיפוש</h2>
              <span className="count-pill">{groups ? `${meta.count} מק"טים` : '0'}</span>
            </div>
            {loading && groups && <div className="reloading-bar" aria-hidden="true" />}
            {meta.explanation && groups && groups.length > 0 && (
              <p className="hint" style={{ marginTop: 0 }}>
                {meta.explanation}
                {meta.location ? ` · מיקום: ${meta.location}` : ''}
              </p>
            )}
            {loading && !groups && <ResultsSkeleton />}
            {!loading && !groups && <p className="empty-state">בצע חיפוש כדי להציג תוצאות</p>}
            {groups && groups.length === 0 && <p className="empty-state">לא נמצאו תוצאות</p>}
            <div className={loading && groups ? 'results-reloading' : undefined}>
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
                        role="button"
                        tabIndex={0}
                        aria-pressed={!narrow && v.entityId === selected}
                        aria-label={`וריאנט ${v.entityId}`}
                        onClick={() => (narrow ? openVariant(v.entityId) : setSelected(v.entityId))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            narrow ? openVariant(v.entityId) : setSelected(v.entityId);
                          }
                        }}
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
            </div>
            {groups && groups.length >= limit && resultParams?.mode === 'exact' && (
              <div className="load-more-row">
                <p className="hint" style={{ margin: '0 0 8px' }}>
                  מוצגות {groups.length} קבוצות · ייתכנו נוספות
                </p>
                <button
                  className="btn btn-ghost"
                  disabled={loading}
                  onClick={() => search(searchedQuery, 'exact', limit + 100)}
                >
                  {loading ? <span className="spinner" /> : 'טען עוד תוצאות'}
                </button>
              </div>
            )}
          </section>

          {!narrow && (
            <div className="detail-col">
              <DetailPanel entityId={selected} />
            </div>
          )}
        </div>
      </main>

      {showCurl && (
        <CurlDialog curl={buildCurl()} onCopy={copyCurl} onClose={() => setShowCurl(false)} />
      )}
    </>
  );
}

function CurlDialog({
  curl,
  onCopy,
  onClose,
}: {
  curl: string;
  onCopy: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog onClose={onClose} ariaLabel="פקודת cURL" modalClass="popup-modal curl-modal">
      <div className="popup-head">
        <h3>cURL — קריאת ה-API</h3>
        <button className="chat-close" onClick={onClose} aria-label="סגור">
          <Icon name="close" />
        </button>
      </div>
      <p className="hint" style={{ marginTop: 0 }}>
        פקודת cURL לקריאת ה-API של החיפוש הנוכחי — לייחצון ואינטגרציה.
      </p>
      <pre className="curl-block">{curl}</pre>
      <div className="chat-report-actions">
        <button className="btn btn-primary btn-sm" onClick={onCopy}>
          <Icon name="copy" /> העתק פקודה
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>
          סגור
        </button>
      </div>
    </Dialog>
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
