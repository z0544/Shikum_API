import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { AiResult, ChatContext, Supplier } from '../api/types';
import { useApp } from '../state/AppContext';

interface Msg {
  id: number;
  role: 'bot' | 'user';
  text?: string;
  results?: AiResult[];
  suppliers?: Supplier[];
}

const GREETING =
  'שלום! 👋 אני העוזר של מערכת השיקום. אענה רק על סמך נתוני המערכת — מק"טים, שירותים וספקים מורשים.\nמה המוצר או השירות שאתם מחפשים? אפשר גם לשאול "מי מספק?" או "מה הטלפון?".';

const START_QUICK = ['כיסא גלגלים', 'טיפול פסיכולוגי', 'מכשיר שמיעה', 'עדשות מולטיפוקל'];

function phoneOf(s: Supplier) {
  return s.mobile || s.workPhone || s.landline || '—';
}

export function ChatBot() {
  const { openVariant } = useApp();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [ctx, setCtx] = useState<ChatContext>({});
  const [quick, setQuick] = useState<string[]>(START_QUICK);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [suggests, setSuggests] = useState<string[]>([]);
  const idRef = useRef(0);
  const bodyRef = useRef<HTMLDivElement>(null);
  const suggestTimer = useRef<number>();
  const suggestSeq = useRef(0);

  const nextId = () => ++idRef.current;
  const pushBot = (m: Omit<Msg, 'id' | 'role'>) =>
    setMsgs((p) => [...p, { id: nextId(), role: 'bot', ...m }]);
  const pushUser = (text: string) => setMsgs((p) => [...p, { id: nextId(), role: 'user', text }]);

  useEffect(() => {
    if (open && msgs.length === 0) pushBot({ text: GREETING });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' });
  }, [msgs, loading]);

  async function send(text: string, ctxOverride?: ChatContext) {
    const q = text.trim();
    if (!q || loading) return;
    window.clearTimeout(suggestTimer.current);
    suggestSeq.current++; // מבטל בקשות השלמה שעדיין בדרך
    setInput('');
    setSuggests([]);
    setQuick([]);
    pushUser(q);
    setLoading(true);
    try {
      const res = await api.chat(q, ctxOverride ?? ctx);
      setCtx(res.context || {});
      pushBot({ text: res.reply, results: res.results, suppliers: res.suppliers });
      setQuick(res.quickReplies || []);
    } catch (e) {
      pushBot({ text: e instanceof ApiError ? e.message : 'אירעה שגיאה. נסו שוב.' });
    } finally {
      setLoading(false);
    }
  }

  /** פעולת המשך מכרטיס מק"ט — שולח הודעה עם הקשר ממוקד למק"ט זה. */
  function cardAction(makat: string, message: string) {
    send(message, { ...ctx, makat });
  }

  /** לחיצה על כפתור מהיר — "חיפוש חדש" מאפס את השיחה, אחרת נשלח כהודעה. */
  function onQuick(qr: string) {
    if (qr === 'חיפוש חדש') {
      newConversation();
      return;
    }
    send(qr);
  }

  function onInputChange(value: string) {
    setInput(value);
    window.clearTimeout(suggestTimer.current);
    const v = value.trim();
    if (v.length < 2) {
      setSuggests([]);
      return;
    }
    const seq = ++suggestSeq.current;
    suggestTimer.current = window.setTimeout(async () => {
      const r = await api.suggest(v);
      if (seq === suggestSeq.current) setSuggests(r); // מתעלמים מתשובות שאיחרו
    }, 200);
  }

  function newConversation() {
    setCtx({});
    setInput('');
    setLoading(false);
    setSuggests([]);
    setQuick(START_QUICK);
    setMsgs([{ id: nextId(), role: 'bot', text: GREETING }]);
  }

  return (
    <>
      {open && (
        <div className="chat-panel" role="dialog" aria-label="עוזר חכם">
          <div className="chat-head">
            <span className="chat-avatar">◈</span>
            <div>
              <h3>עוזר חכם</h3>
              <span className="chat-sub">מבוסס על נתוני המערכת בלבד</span>
            </div>
            <button className="chat-new" onClick={newConversation} title="התחל שיחה חדשה">
              ↺ שיחה חדשה
            </button>
            <button className="chat-close" onClick={() => setOpen(false)} aria-label="סגור">
              ✕
            </button>
          </div>

          <div className="chat-body" ref={bodyRef}>
            {msgs.map((m) => (
              <div key={m.id} className={`chat-msg ${m.role}`}>
                {m.text && <div className="chat-text">{m.text}</div>}

                {m.results && m.results.length > 0 && (
                  <div className="chat-results">
                    {m.results.map((r) => (
                      <div className="chat-result" key={r.catalogNumber}>
                        <div className="chat-result-top">
                          <span className="makt-badge">{r.catalogNumber}</span>
                          <span className="chat-result-title">{r.description || '—'}</span>
                        </div>
                        <div className="chat-result-meta">
                          <span className="chip green">{r.supplier_count} ספקים</span>
                          {r.variants[0]?.catalogPricelistNum && (
                            <span className="chip amber">קוד שירות: {r.variants[0].catalogPricelistNum}</span>
                          )}
                          {r.nearest_supplier && (
                            <span className="chip">
                              ספק קרוב: {r.nearest_supplier.name}
                              {r.nearest_supplier.proximity_label ? ` · ${r.nearest_supplier.proximity_label}` : ''}
                            </span>
                          )}
                        </div>
                        <div className="chat-actions">
                          <button className="chat-chip sm" onClick={() => cardAction(r.catalogNumber, 'מי מספק?')}>
                            מי מספק?
                          </button>
                          <button className="chat-chip sm" onClick={() => cardAction(r.catalogNumber, 'מה הטלפון?')}>
                            פרטי קשר
                          </button>
                          {r.variants[0] && (
                            <button className="chat-chip sm" onClick={() => openVariant(r.variants[0].entityId)}>
                              פתח מק"ט
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {m.suppliers && m.suppliers.length > 0 && (
                  <div className="chat-results">
                    {m.suppliers.map((s) => (
                      <div className="chat-result chat-supplier" key={s.modSupplierId}>
                        <div className="chat-result-title">{s.name || '—'}</div>
                        <div className="chat-result-meta">
                          <span className="chip">☎ {phoneOf(s)}</span>
                          {s.city && <span className="chip">{s.city}</span>}
                          {s.proximity_label && <span className="chip green">{s.proximity_label}</span>}
                          {s.profession && <span className="chip">{s.profession}</span>}
                        </div>
                        {s.email && (
                          <a className="chat-mail" href={`mailto:${s.email}`} onClick={(e) => e.stopPropagation()}>
                            {s.email}
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="chat-msg bot">
                <span className="chat-typing">
                  <i />
                  <i />
                  <i />
                </span>
              </div>
            )}
          </div>

          {suggests.length > 0 ? (
            <div className="chat-autocomplete">
              {suggests.map((s) => (
                <button key={s} className="chat-ac-item" onClick={() => send(s)} title={s}>
                  {s}
                </button>
              ))}
            </div>
          ) : (
            quick.length > 0 &&
            !loading && (
              <div className="chat-quick">
                {quick.map((qr) => (
                  <button key={qr} className="chat-chip" onClick={() => onQuick(qr)}>
                    {qr}
                  </button>
                ))}
              </div>
            )
          )}

          <div className="chat-foot">
            <input
              value={input}
              onChange={(e) => onInputChange(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send(input)}
              placeholder="כתבו הודעה…"
              aria-label="הודעה"
            />
            <button className="btn btn-primary btn-sm" onClick={() => send(input)} disabled={loading}>
              שלח
            </button>
          </div>
        </div>
      )}

      <button
        className={`chat-fab${open ? ' open' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'סגור עוזר חכם' : 'פתח עוזר חכם'}
        title="עוזר חכם"
      >
        {open ? '✕' : '💬'}
      </button>
    </>
  );
}
