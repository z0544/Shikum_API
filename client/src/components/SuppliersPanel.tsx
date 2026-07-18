import { Fragment, useState } from 'react';
import type { Supplier } from '../api/types';
import { Icon } from './icons';
import { normalizePhone, telHref } from '../format';

const PHONE_KEYS = new Set<keyof Supplier>(['mobile', 'workPhone', 'landline']);

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

/** תא טלפון לחיץ (חיוג). */
function PhoneLink({ value }: { value: string | null | undefined }) {
  const href = telHref(value);
  const display = normalizePhone(value) || '—';
  return href ? (
    <a href={href} onClick={(e) => e.stopPropagation()}>
      {display}
    </a>
  ) : (
    <>{display}</>
  );
}

/**
 * מציג את רשימת הספקים המורשים עם סינון חופשי ושורות ניתנות להרחבה
 * (כל שדות ה-XLSX). רכיב משותף לדף הווריאנט, לחיפוש ולחיפוש החכם.
 * איפוס הסינון/ההרחבות נעשה ע"י key חיצוני (למשל entityId / מק"ט).
 */
export function SuppliersPanel({
  suppliers,
  title = 'ספקים מורשים',
}: {
  suppliers: Supplier[];
  title?: string;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const query = filter.trim().toLowerCase();
  const filtered = query
    ? suppliers.filter((s) =>
        [
          s.name,
          s.city,
          s.district,
          s.profession,
          s.specialization,
          s.subSpecialization,
          s.therapeuticApproach,
          s.email,
          s.street,
          s.modSupplierId,
          s.rehabSupplierId,
          s.mobile,
          s.workPhone,
          s.landline,
        ].some((v) => v && String(v).toLowerCase().includes(query)),
      )
    : suppliers;

  return (
    <section className="card">
      <div className="panel-head">
        <h2>{title}</h2>
        <div className="panel-head-actions">
          <span className="count-pill">
            {query ? `${filtered.length} / ${suppliers.length}` : suppliers.length}
          </span>
        </div>
      </div>
      {suppliers.length === 0 ? (
        <p className="empty-state">אין ספקים מורשים למק"ט זה</p>
      ) : (
        <>
          <input
            className="sup-filter"
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="סינון ספקים — שם, יישוב, מחוז, מקצוע, התמחות…"
          />
          {filtered.length === 0 ? (
            <p className="empty-state">לא נמצאו ספקים התואמים לסינון</p>
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
                  {filtered.map((s) => {
                    const open = expanded.has(s.modSupplierId);
                    const details = SUPPLIER_DETAIL.filter(([k]) => {
                      const v = s[k];
                      return v !== null && v !== undefined && v !== '';
                    });
                    return (
                      <Fragment key={s.modSupplierId}>
                        <tr
                          className={`sup-row${details.length ? '' : ' sup-row-static'}`}
                          onClick={() => details.length && toggle(s.modSupplierId)}
                        >
                          <td>{s.name || '—'}</td>
                          <td>{s.city || '—'}</td>
                          <td>{s.district || '—'}</td>
                          <td>
                            <PhoneLink value={s.mobile || s.workPhone || s.landline} />
                          </td>
                          <td>{s.profession || '—'}</td>
                          <td className="sup-caret">
                            {details.length ? (
                              <button
                                type="button"
                                className="sup-toggle"
                                aria-expanded={open}
                                aria-label={`${open ? 'הסתר' : 'הצג'} פרטי הספק ${s.name || ''}`.trim()}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggle(s.modSupplierId);
                                }}
                              >
                                <Icon name={open ? 'chevron-up' : 'chevron-down'} />
                              </button>
                            ) : null}
                          </td>
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
                                        {k === 'email' ? (
                                          <a href={`mailto:${v}`}>{v}</a>
                                        ) : PHONE_KEYS.has(k) ? (
                                          <PhoneLink value={s[k] as string} />
                                        ) : (
                                          v
                                        )}
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
        </>
      )}
    </section>
  );
}
