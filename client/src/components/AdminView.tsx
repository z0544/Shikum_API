import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { ConfigMapRow, SynonymRow, SyncPlan, SyncRun, UnansweredRow } from '../api/types';
import { useApp } from '../state/AppContext';
import { Breadcrumbs } from './Header';

const KINDS: [string, string][] = [
  ['items', 'מק"טים'],
  ['suppliers', 'ספקים'],
  ['agreements', 'הסכמים'],
];

export function AdminView() {
  const { adminToken, setAdminToken, showToast } = useApp();
  const [kind, setKind] = useState('items');
  const [file, setFile] = useState<File | null>(null);
  const [drag, setDrag] = useState(false);
  const [plan, setPlan] = useState<SyncPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [runs, setRuns] = useState<SyncRun[]>([]);
  const [config, setConfig] = useState<ConfigMapRow[]>([]);
  const [synonyms, setSynonyms] = useState<SynonymRow[]>([]);
  const [unanswered, setUnanswered] = useState<UnansweredRow[]>([]);
  const [prefillTerm, setPrefillTerm] = useState('');

  const hasToken = adminToken.trim().length > 0;

  async function refresh() {
    if (!hasToken) return;
    try {
      const [r, c, syn, un] = await Promise.all([
        api.syncRuns(adminToken),
        api.configList(adminToken),
        api.synonymsList(adminToken),
        api.unansweredList(adminToken),
      ]);
      setRuns(r.runs);
      setConfig(c.items);
      setSynonyms(syn.items);
      setUnanswered(un.items);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        showToast(e.message, 'error');
      }
    }
  }

  async function addSynonym(term: string, target: string) {
    try {
      await api.synonymAdd({ term, target }, adminToken);
      showToast('נרדף נוסף', 'ok');
      refresh();
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'שגיאה', 'error');
    }
  }

  async function deleteSynonym(id: number) {
    try {
      await api.synonymDelete(id, adminToken);
      refresh();
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'שגיאה', 'error');
    }
  }
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminToken]);

  async function preview() {
    if (!file) return showToast('בחר קובץ', 'error');
    setBusy(true);
    setPlan(null);
    try {
      setPlan(await api.syncPreview(kind, file, adminToken));
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'שגיאה בתצוגה מקדימה', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!file) return;
    if (!confirm('להחיל את השינויים על בסיס הנתונים?')) return;
    setBusy(true);
    try {
      const r = await api.syncApply(kind, file, adminToken);
      showToast(
        `הוחל: ${r.summary.new} חדשים · ${r.summary.updated} עודכנו · ${r.summary.deleted} הוסרו`,
        'ok',
      );
      setPlan(null);
      setFile(null);
      refresh();
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'שגיאה בהחלה', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function saveConfig(row: ConfigMapRow, intValue: number) {
    try {
      await api.configUpsert({ field: row.field, textValue: row.textValue, intValue }, adminToken);
      showToast('המיפוי עודכן', 'ok');
      refresh();
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'שגיאה', 'error');
    }
  }

  return (
    <>
      <Breadcrumbs trail={['דף הבית', 'ניהול וטעינת נתונים']} />
      <main>
        <section className="card">
          <div className="panel-head">
            <h2>אסימון ניהול</h2>
          </div>
          <div className="search-row">
            <div className="field grow">
              <label>X-Admin-Token</label>
              <input
                type="password"
                value={adminToken}
                onChange={(e) => setAdminToken(e.target.value)}
                placeholder="הזן אסימון (ברירת מחדל בפיתוח: shikum-admin-dev)"
              />
            </div>
            <button className="btn btn-ghost" onClick={refresh}>רענן</button>
          </div>
          {!hasToken && <p className="hint">נדרש אסימון כדי לבצע פעולות ניהול.</p>}
        </section>

        {hasToken && (
          <>
            <section className="card">
              <div className="panel-head">
                <h2>טעינת דלתא (Delta Sync)</h2>
              </div>
              <div className="tabs">
                {KINDS.map(([k, l]) => (
                  <button
                    key={k}
                    className={kind === k ? 'active' : ''}
                    onClick={() => {
                      setKind(k);
                      setPlan(null);
                    }}
                  >
                    {l}
                  </button>
                ))}
              </div>

              <div
                className={`dropzone${drag ? ' drag' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDrag(true);
                }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDrag(false);
                  if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
                }}
                onClick={() => document.getElementById('fileInput')?.click()}
              >
                {file ? (
                  <b>📄 {file.name}</b>
                ) : (
                  <>גרור לכאן קובץ XLSX / CSV או לחץ לבחירה</>
                )}
                <input
                  id="fileInput"
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  hidden
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
              </div>

              <div className="smart-actions">
                <button className="btn btn-primary" onClick={preview} disabled={busy || !file}>
                  {busy ? <span className="spinner" /> : 'תצוגה מקדימה'}
                </button>
                <button className="btn btn-green" onClick={apply} disabled={busy || !plan}>
                  החל שינויים
                </button>
              </div>

              {plan && (
                <>
                  <div className="summary-cards">
                    <div className="summary-card new">
                      <div className="n">{plan.summary.new}</div>
                      <div className="l">חדשים</div>
                    </div>
                    <div className="summary-card upd">
                      <div className="n">{plan.summary.updated}</div>
                      <div className="l">עודכנו</div>
                    </div>
                    <div className="summary-card del">
                      <div className="n">{plan.summary.deleted}</div>
                      <div className="l">הוסרו</div>
                    </div>
                    <div className="summary-card">
                      <div className="n">{plan.summary.unchanged}</div>
                      <div className="l">ללא שינוי</div>
                    </div>
                  </div>
                  <PlanTable title="עודכנו (כולל שינויי שדות)" rows={plan.updated} showChanges />
                  <PlanTable title="חדשים" rows={plan.new.slice(0, 100)} />
                  <PlanTable title="הוסרו (Soft Delete)" rows={plan.deleted.slice(0, 100)} />
                </>
              )}
            </section>

            <section className="card">
              <div className="panel-head">
                <h2>היסטוריית הרצות סנכרון</h2>
                <span className="count-pill">{runs.length}</span>
              </div>
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>סוג</th>
                      <th>קובץ</th>
                      <th>סטטוס</th>
                      <th>חדש</th>
                      <th>עודכן</th>
                      <th>הוסר</th>
                      <th>זמן</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.length === 0 && (
                      <tr><td colSpan={8} className="loading-row">אין הרצות עדיין</td></tr>
                    )}
                    {runs.map((r) => (
                      <tr key={r.id}>
                        <td>{r.id}</td>
                        <td>{r.fileType}</td>
                        <td>{r.filename || '—'}</td>
                        <td><span className={`badge-status ${r.status}`}>{r.status}</span></td>
                        <td>{r.addedCount}</td>
                        <td>{r.updatedCount}</td>
                        <td>{r.deletedCount}</td>
                        <td>{new Date(r.startedAt).toLocaleString('he-IL')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <ConfigEditor rows={config} onSave={saveConfig} />

            <SynonymEditor
              rows={synonyms}
              prefill={prefillTerm}
              onAdd={addSynonym}
              onDelete={deleteSynonym}
            />

            <UnansweredTable rows={unanswered} onSuggest={setPrefillTerm} />
          </>
        )}
      </main>
    </>
  );
}

function PlanTable({
  title,
  rows,
  showChanges,
}: {
  title: string;
  rows: SyncPlan['updated'];
  showChanges?: boolean;
}) {
  if (!rows.length) return null;
  return (
    <div style={{ marginTop: 14 }}>
      <h3 style={{ fontSize: 15, color: 'var(--brand-dark)' }}>{title} ({rows.length})</h3>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>מפתח</th>
              <th>תיאור</th>
              {showChanges && <th>שינויים</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td style={{ fontFamily: 'monospace' }}>{r.key}</td>
                <td>{String(r.label.description ?? r.label.name ?? r.label.catalogNumber ?? '—')}</td>
                {showChanges && (
                  <td>
                    {r.restored && <span className="chip green">שוחזר</span>}{' '}
                    {(r.changes || [])
                      .map((c) => `${c.field}: ${c.old ?? '∅'} → ${c.new ?? '∅'}`)
                      .join(' · ')}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ConfigEditor({
  rows,
  onSave,
}: {
  rows: ConfigMapRow[];
  onSave: (row: ConfigMapRow, intValue: number) => void;
}) {
  return (
    <section className="card">
      <div className="panel-head">
        <h2>מילון קונפיגורציה (טקסט → מספר)</h2>
        <span className="count-pill">{rows.length}</span>
      </div>
      <p className="hint" style={{ marginTop: 0 }}>
        קובע את הערכים המספריים ב-Variant ID. עריכת ערך תשפיע על טעינות עתידיות.
      </p>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>שדה</th>
              <th>ערך טקסט</th>
              <th>ערך מספרי</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <ConfigRow key={r.id} row={r} onSave={onSave} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SynonymEditor({
  rows,
  prefill,
  onAdd,
  onDelete,
}: {
  rows: SynonymRow[];
  prefill: string;
  onAdd: (term: string, target: string) => void;
  onDelete: (id: number) => void;
}) {
  const [term, setTerm] = useState('');
  const [target, setTarget] = useState('');
  useEffect(() => {
    if (prefill) setTerm(prefill);
  }, [prefill]);

  function submit() {
    if (!term.trim() || !target.trim()) return;
    onAdd(term.trim(), target.trim());
    setTerm('');
    setTarget('');
  }

  return (
    <section className="card">
      <div className="panel-head">
        <h2>מילון נרדפות (מונח → מונח רשמי)</h2>
        <span className="count-pill">{rows.length}</span>
      </div>
      <p className="hint" style={{ marginTop: 0 }}>
        מיפוי שפת דיבור/סלנג למונחים שבקטלוג — משפיע מיד על החיפוש החכם והעוזר, ללא deploy.
      </p>
      <div className="search-row">
        <div className="field grow">
          <label>מונח (שפת משתמש)</label>
          <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="למשל: עגלה" />
        </div>
        <div className="field grow">
          <label>מונח רשמי בקטלוג</label>
          <input
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="למשל: כיסא גלגלים"
          />
        </div>
        <button className="btn btn-primary" onClick={submit} disabled={!term.trim() || !target.trim()}>
          הוסף
        </button>
      </div>
      {rows.length > 0 && (
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table className="data">
            <thead>
              <tr>
                <th>מונח</th>
                <th>→ מונח רשמי</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.term}</td>
                  <td>{r.target}</td>
                  <td>
                    <button className="btn btn-ghost btn-sm" onClick={() => onDelete(r.id)}>
                      מחק
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function UnansweredTable({
  rows,
  onSuggest,
}: {
  rows: UnansweredRow[];
  onSuggest: (query: string) => void;
}) {
  return (
    <section className="card">
      <div className="panel-head">
        <h2>שאילתות ללא מענה (backlog לנרדפות)</h2>
        <span className="count-pill">{rows.length}</span>
      </div>
      <p className="hint" style={{ marginTop: 0 }}>
        שאילתות שהחזירו "לא נמצאו תוצאות", לפי שכיחות. "הוסף נרדף" ממלא את המונח בטופס למעלה.
      </p>
      {rows.length === 0 ? (
        <p className="empty-state">אין עדיין שאילתות ללא מענה</p>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>שאילתה</th>
                <th>פעמים</th>
                <th>אחרון</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.rawSample || r.query}</td>
                  <td>{r.count}</td>
                  <td>{new Date(r.lastSeen).toLocaleDateString('he-IL')}</td>
                  <td>
                    <button className="btn btn-ghost btn-sm" onClick={() => onSuggest(r.rawSample || r.query)}>
                      → הוסף נרדף
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ConfigRow({
  row,
  onSave,
}: {
  row: ConfigMapRow;
  onSave: (row: ConfigMapRow, intValue: number) => void;
}) {
  const [val, setVal] = useState(String(row.intValue));
  const dirty = val !== String(row.intValue);
  return (
    <tr>
      <td>{row.field}</td>
      <td>{row.textValue}</td>
      <td>
        <input
          style={{ width: 80, padding: '5px 8px' }}
          type="number"
          value={val}
          onChange={(e) => setVal(e.target.value)}
        />
      </td>
      <td>
        <button
          className="btn btn-ghost btn-sm"
          disabled={!dirty}
          onClick={() => onSave(row, parseInt(val, 10) || 0)}
        >
          שמור
        </button>
      </td>
    </tr>
  );
}
