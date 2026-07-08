import { Fragment, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { ItemDetail, Supplier } from '../api/types';
import { useApp } from '../state/AppContext';

/** שדות ספק נוספים שנחשפים בהרחבת שורת הספק (כולם כבר מגיעים מה-API). */
const SUPPLIER_DETAIL: [keyof Supplier, string][] = [
  ['modSupplierId', 'מספר ספק משהב"ט'],
  ['rehabSupplierId', 'מספר ספק שיקום'],
  ['mobile', 'נייד'],
  ['workPhone', 'טלפון עבודה'],
  ['landline', 'נייח'],
  ['email', 'דוא"ל'],
  ['street', 'רחוב ומספר בית'],
  ['specialization', 'התמחות'],
  ['subSpecialization', 'תת התמחות'],
  ['therapeuticApproach', 'גישה טיפולית'],
  ['validFrom', 'תחילת תוקף'],
  ['validTo', 'סיום תוקף'],
];

const FIELD_LABELS: [keyof ItemDetail, string][] = [
  ['catalogNumber', 'מק"ט'],
  ['entitledTypeRaw', 'סוג זכאי'],
  ['amountTypeRaw', 'סוג סכום'],
  ['baseLevel', 'רמת בסיס'],
  ['exceptionLevel', 'רמת חריגה'],
  ['exceptionPercent', 'אחוז לחריגה'],
  ['amount', 'סכום'],
  ['entitlementFrequency', 'תדירות זכאות'],
  ['maxQuantity', 'כמות מירבית'],
];

function phone(s: { mobile?: string | null; workPhone?: string | null; landline?: string | null }) {
  return s.mobile || s.workPhone || s.landline || '—';
}

export function DetailPanel({ entityId }: { entityId: string | null }) {
  const { showToast } = useApp();
  const [item, setItem] = useState<ItemDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [expandedSuppliers, setExpandedSuppliers] = useState<Set<string>>(new Set());

  function toggleSupplier(id: string) {
    setExpandedSuppliers((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  useEffect(() => {
    if (!entityId) {
      setItem(null);
      return;
    }
    let alive = true;
    setLoading(true);
    setShowHistory(false);
    setExpandedSuppliers(new Set());
    api
      .getItem(entityId)
      .then((d) => alive && setItem(d))
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
  if (loading) return <div className="card loading-row">טוען פרטים…</div>;
  if (!item) return null;

  const suppliers = item.authorized_suppliers || [];

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
        {item.special_note && <div className="note">⚠ {item.special_note}</div>}
        <div className="smart-actions">
          <a className="btn btn-green btn-sm" href={api.exportMaktUrl(item.catalogNumber, item.entityId)}>
            ⬇ ייצוא מק"ט + ספקים (Excel)
          </a>
          {item.change_history.length > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={() => setShowHistory((s) => !s)}>
              היסטוריית שינויים ({item.history_count})
            </button>
          )}
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

      <section className="card">
        <div className="panel-head">
          <h2>ספקים מורשים</h2>
          <span className="count-pill">{suppliers.length}</span>
        </div>
        {suppliers.length === 0 ? (
          <p className="empty-state">אין ספקים מורשים למק"ט זה</p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>שם ספק</th>
                  <th>יישוב</th>
                  <th>מחוז</th>
                  <th>טלפון</th>
                  <th>מקצוע</th>
                  <th aria-label="פרטים" style={{ width: 32 }} />
                </tr>
              </thead>
              <tbody>
                {suppliers.map((s) => {
                  const open = expandedSuppliers.has(s.modSupplierId);
                  const details = SUPPLIER_DETAIL.filter(([k]) => {
                    const v = s[k];
                    return v !== null && v !== undefined && v !== '';
                  });
                  return (
                    <Fragment key={s.modSupplierId}>
                      <tr
                        className="sup-row"
                        onClick={() => details.length && toggleSupplier(s.modSupplierId)}
                      >
                        <td>{s.name || '—'}</td>
                        <td>{s.city || '—'}</td>
                        <td>{s.district || '—'}</td>
                        <td>{phone(s)}</td>
                        <td>{s.profession || '—'}</td>
                        <td className="sup-caret">{details.length ? (open ? '▲' : '▼') : ''}</td>
                      </tr>
                      {open && (
                        <tr className="sup-detail-row">
                          <td colSpan={6}>
                            <div className="detail-grid">
                              {details.map(([k, label]) => {
                                const v = String(s[k]);
                                return (
                                  <div className="detail-cell" key={String(k)}>
                                    <div className="k">{label}</div>
                                    <div className="v">
                                      {k === 'email' ? <a href={`mailto:${v}`}>{v}</a> : v}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
