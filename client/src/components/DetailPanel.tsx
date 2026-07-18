import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { ItemDetail } from '../api/types';
import { useApp } from '../state/AppContext';
import { SuppliersPanel } from './SuppliersPanel';
import { Icon } from './icons';
import { Dialog } from './Dialog';

const FIELD_LABELS: [keyof ItemDetail, string][] = [
  ['catalogNumber', 'מק"ט'],
  ['entitledTypeRaw', 'סוג זכאי'],
  ['amountTypeRaw', 'סוג סכום'],
  ['baseLevel', 'רמת בסיס'],
  ['exceptionLevel', 'רמת חריגה'],
  ['exceptionPercent', 'אחוז לחריגה'],
  ['amount', 'סכום'],
  ['catalogPricelistNum', 'קוד שירות'],
  ['entitlementFrequency', 'תדירות זכאות'],
  ['maxQuantity', 'כמות מירבית'],
];

export function DetailPanel({
  entityId,
  onLoaded,
}: {
  entityId: string | null;
  onLoaded?: (item: ItemDetail) => void;
}) {
  const { showToast } = useApp();
  const [item, setItem] = useState<ItemDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showApi, setShowApi] = useState(false);

  useEffect(() => {
    if (!entityId) {
      setItem(null);
      return;
    }
    let alive = true;
    setLoading(true);
    setShowHistory(false);
    api
      .getItem(entityId)
      .then((d) => {
        if (!alive) return;
        setItem(d);
        onLoaded?.(d);
      })
      .catch((e) => {
        if (alive) showToast(e instanceof ApiError ? e.message : 'שגיאה בטעינת הפריט', 'error');
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [entityId, showToast]);

  if (!entityId) {
    return (
      <div className="card">
        <p className="empty-state">בחר וריאנט מהתוצאות כדי לצפות בפרטים ובספקים המורשים</p>
      </div>
    );
  }
  if (loading)
    return (
      <div className="card">
        <div className="skeleton-list" aria-hidden="true">
          <span className="sk sk-line" style={{ width: '60%', height: 20 }} />
          {[0, 1, 2, 3].map((i) => (
            <span className="sk sk-line" key={i} />
          ))}
        </div>
      </div>
    );
  if (!item) return null;

  const suppliers = item.authorized_suppliers || [];

  // פקודות cURL להמרה דו-כיוונית מק"ט ↔ קוד מב"ר — לצפייה ב-URL של ה-API ולהעתקה.
  function apiCurls(): string {
    const origin = window.location.origin;
    const makat = item!.catalogNumber;
    const lines = [
      '# מק"ט → קוד מב"ר',
      `curl '${origin}/api/makt/${encodeURIComponent(makat)}/mabar'`,
    ];
    if (item!.catalogPricelistNum) {
      lines.push(
        '',
        '# קוד מב"ר → מק"טים (הפוך)',
        `curl '${origin}/api/mabar/${encodeURIComponent(item!.catalogPricelistNum)}/makt'`,
      );
    }
    return lines.join('\n');
  }

  function copyApi() {
    navigator.clipboard
      ?.writeText(apiCurls())
      .then(() => showToast('פקודת cURL הועתקה', 'ok'))
      .catch(() => showToast('לא ניתן להעתיק', 'error'));
  }

  return (
    <>
      <section className="card">
        <div className="panel-head">
          <h2>פרטי וריאנט</h2>
          <span className="count-pill" style={{ fontFamily: 'monospace' }}>{item.entityId}</span>
        </div>
        <p style={{ marginTop: 0, fontWeight: 600 }}>{item.description || '—'}</p>
        <div className="detail-grid">
          {FIELD_LABELS.map(([k, label]) => {
            const v = item[k];
            if (v === null || v === undefined || v === '' || v === 'לא מוגדר') return null;
            return (
              <div className="detail-cell" key={String(k)}>
                <div className="k">{label}</div>
                <div className="v">{String(v)}</div>
              </div>
            );
          })}
        </div>
        {item.special_note && (
          <div className="note">
            <Icon name="warning" /> {item.special_note}
          </div>
        )}
        <div className="smart-actions">
          <a className="btn btn-green btn-sm" href={api.exportMaktUrl(item.catalogNumber, item.entityId)}>
            <Icon name="download" /> ייצוא מק"ט + ספקים (Excel)
          </a>
          {item.change_history.length > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={() => setShowHistory((s) => !s)}>
              היסטוריית שינויים ({item.history_count})
            </button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={() => setShowApi(true)}>
            <Icon name="copy" /> cURL / API
          </button>
        </div>
        {showHistory && (
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table className="data">
              <thead>
                <tr>
                  <th>פעולה</th>
                  <th>שדה</th>
                  <th>לפני</th>
                  <th>אחרי</th>
                  <th>מתי</th>
                </tr>
              </thead>
              <tbody>
                {item.change_history.map((h) => (
                  <tr key={h.id}>
                    <td>{h.action}</td>
                    <td>{h.fieldName || '—'}</td>
                    <td>{h.oldValue || '—'}</td>
                    <td>{h.newValue || '—'}</td>
                    <td>{new Date(h.changedAt).toLocaleString('he-IL')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <SuppliersPanel key={item.entityId} suppliers={suppliers} />

      {showApi && (
        <ApiCurlDialog curl={apiCurls()} onCopy={copyApi} onClose={() => setShowApi(false)} />
      )}
    </>
  );
}

function ApiCurlDialog({
  curl,
  onCopy,
  onClose,
}: {
  curl: string;
  onCopy: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog onClose={onClose} ariaLabel="cURL — קריאות API" modalClass="popup-modal curl-modal">
      <div className="popup-head">
        <h3>cURL — המרת מק"ט ↔ קוד מב"ר</h3>
        <button className="chat-close" onClick={onClose} aria-label="סגור">
          <Icon name="close" />
        </button>
      </div>
      <p className="hint" style={{ marginTop: 0 }}>
        כתובות ה-API להמרה דו-כיוונית בין מק"ט לקוד מב"ר — לצפייה, העתקה ואינטגרציה.
      </p>
      <pre className="curl-block">{curl}</pre>
      <div className="chat-report-actions">
        <button className="btn btn-primary btn-sm" onClick={onCopy}>
          <Icon name="copy" /> העתק
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>
          סגור
        </button>
      </div>
    </Dialog>
  );
}
