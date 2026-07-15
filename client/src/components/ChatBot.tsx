import { useEffect, useMemo, useRef, useState } from 'react';
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

type Intent = 'search' | 'suppliers' | 'contact';

const GREETING =
  'שלום! 👋 אני העוזר של מערכת השיקום. אענה רק על סמך נתוני המערכת — מק"טים, שירותים וספקים מורשים.\nמה המוצר או השירות שאתם מחפשים? אפשר גם לשאול "מי מספק?" או "מה הטלפון?".';

const START_QUICK = ['כיסא גלגלים', 'טיפול פסיכולוגי', 'מכשיר שמיעה', 'עדשות מולטיפוקל'];

/** מיקרו-קופי לאינדיקטור ההקלדה, לפי הכוונה שזוהתה כבר בלקוח. */
const TYPING_MICROCOPY: Record<Intent, string> = {
  search: 'מחפש מק"טים…',
  suppliers: 'מדרג ספקים לפי מרחק…',
  contact: 'מאתר פרטי קשר…',
};

/** זיהוי כוונה מקומי (מראה מפושט של classifyIntent בשרת) — למיקרו-קופי בלבד. */
function detectIntent(text: string): Intent {
  const t = text.toLowerCase();
  const has = (words: string[]) => words.some((w) => t.includes(w));
  if (has(['טלפון', 'נייד', 'מייל', 'דוא"ל', 'כתובת', 'ליצור קשר', 'יצירת קשר', 'פרטי קשר', 'מספר של']))
    return 'contact';
  if (has(['מספק', 'נותן שירות', 'מי נותן', 'ספקים', 'מורשה', 'מורשים', 'היכן אפשר', 'איפה אפשר']))
    return 'suppliers';
  return 'search';
}

function phoneOf(s: Supplier) {
  return s.mobile || s.workPhone || s.landline || '—';
}

/** קישור ניווט (Waze) לפי כתובת הספק. */
function navUrl(s: Supplier) {
  const q = [s.street, s.city].filter(Boolean).join(' ');
  return `https://waze.com/ul?q=${encodeURIComponent(q)}&navigate=yes`;
}

/** מזרים טקסט מילה-מילה (~25ms/מילה) — הזרמה מדומה של תשובת העוזר. */
function StreamedText({
  text,
  onProgress,
  onDone,
}: {
  text: string;
  onProgress?: () => void;
  onDone?: () => void;
}) {
  // כל אלמנט = מילה + הרווח/שורה שאחריה, כדי לשמר ריווח ושבירות שורה.
  const words = useMemo(() => text.match(/\S+\s*/g) ?? [text], [text]);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (n >= words.length) {
      onDone?.();
      return;
    }
    const t = window.setTimeout(() => {
      setN((c) => c + 1);
      onProgress?.();
    }, 25);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n, words.length]);
  return <>{words.slice(0, n).join('')}</>;
}

export function ChatBot() {
  const { openVariant, openSearch, showToast } = useApp();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [ctx, setCtx] = useState<ChatContext>({});
  const [quick, setQuick] = useState<string[]>(START_QUICK);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [suggests, setSuggests] = useState<string[]>([]);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [pendingIntent, setPendingIntent] = useState<Intent | null>(null);
  const [catalogCount, setCatalogCount] = useState<number | null>(null);
  const idRef = useRef(0);
  const bodyRef = useRef<HTMLDivElement>(null);
  const suggestTimer = useRef<number>();
  const suggestSeq = useRef(0);

  const nextId = () => ++idRef.current;
  const pushBot = (m: Omit<Msg, 'id' | 'role'>) =>
    setMsgs((p) => [...p, { id: nextId(), role: 'bot', ...m }]);
  const pushUser = (text: string) => setMsgs((p) => [...p, { id: nextId(), role: 'user', text }]);
  const markRevealed = (id: number) =>
    setRevealed((s) => {
      if (s.has(id)) return s;
      const n = new Set(s);
      n.add(id);
      return n;
    });

  const scrollToBottom = (smooth = false) =>
    bodyRef.current?.scrollTo({
      top: bodyRef.current.scrollHeight,
      behavior: smooth ? 'smooth' : 'auto',
    });

  useEffect(() => {
    if (!open) return;
    if (msgs.length === 0) pushBot({ text: GREETING });
    if (catalogCount == null) {
      fetch('/health')
        .then((r) => r.json())
        .then((d) => setCatalogCount(typeof d.item_count === 'number' ? d.item_count : null))
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    scrollToBottom(true);
  }, [msgs, loading]);

  async function send(text: string, ctxOverride?: ChatContext) {
    const q = text.trim();
    if (!q || loading) return;
    window.clearTimeout(suggestTimer.current);
    suggestSeq.current++; // מבטל בקשות השלמה שעדיין בדרך
    setInput('');
    setSuggests([]);
    setQuick([]);
    setPendingIntent(detectIntent(q)); // מיקרו-קופי מיידי לפני קריאת ה-API
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

  /** פותח את התוצאה בעמוד החיפוש הראשי (עם וריאנטים, ספקים ופאנל פרטים) וסוגר את הצ'אט. */
  function openInPage(makat: string) {
    openSearch(makat);
    setOpen(false);
  }

  /** לחיצה על כפתור מהיר — "חיפוש חדש" מאפס את השיחה, אחרת נשלח כהודעה. */
  function onQuick(qr: string) {
    if (qr === 'חיפוש חדש') {
      newConversation();
      return;
    }
    send(qr);
  }

  /** העתקת טלפון הספק ללוח. */
  function copyPhone(s: Supplier) {
    const phone = phoneOf(s);
    if (phone === '—') return;
    navigator.clipboard
      ?.writeText(phone)
      .then(() => showToast('הטלפון הועתק', 'ok'))
      .catch(() => showToast('לא ניתן להעתיק', 'error'));
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
    setPendingIntent(null);
    setQuick(START_QUICK);
    setRevealed(new Set());
    setMsgs([{ id: nextId(), role: 'bot', text: GREETING }]);
  }

  const subtitle = loading
    ? pendingIntent
      ? TYPING_MICROCOPY[pendingIntent]
      : 'מחפש…'
    : catalogCount != null
      ? `${catalogCount.toLocaleString('he-IL')} מק"טים במאגר · מקוון`
      : 'מקוון';

  return (
    <>
      {open && (
        <div className="chat-panel" role="dialog" aria-label="עוזר חכם">
          <div className="chat-head">
            <span className="chat-avatar">◈</span>
            <div>
              <h3>עוזר חכם</h3>
              <span className="chat-sub">
                <i className={`chat-status-dot${loading ? ' busy' : ''}`} />
                {subtitle}
              </span>
            </div>
            <button className="chat-new" onClick={newConversation} title="התחל שיחה חדשה">
              ↺ שיחה חדשה
            </button>
            <button className="chat-close" onClick={() => setOpen(false)} aria-label="סגור">
              ✕
            </button>
          </div>

          <div className="chat-body" ref={bodyRef}>
            {msgs.map((m) => {
              const streaming = m.role === 'bot' && !!m.text && !revealed.has(m.id);
              const showCards = !streaming;
              return (
                <div key={m.id} className={`chat-msg ${m.role}`}>
                  {m.text && (
                    <div className="chat-text">
                      {streaming ? (
                        <StreamedText
                          text={m.text}
                          onProgress={() => scrollToBottom(false)}
                          onDone={() => markRevealed(m.id)}
                        />
                      ) : (
                        m.text
                      )}
                    </div>
                  )}

                  {showCards && m.results && m.results.length > 0 && (
                    <div className="chat-results">
                      {m.results.map((r, i) => (
                        <div
                          className="chat-result"
                          style={{ animationDelay: `${i * 60}ms` }}
                          key={r.catalogNumber}
                        >
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
                            {r.supplier_count > 0 && (
                              <>
                                <button className="chat-chip sm" onClick={() => cardAction(r.catalogNumber, 'מי מספק?')}>
                                  מי מספק?
                                </button>
                                <button className="chat-chip sm" onClick={() => cardAction(r.catalogNumber, 'מה הטלפון?')}>
                                  פרטי קשר
                                </button>
                              </>
                            )}
                            {r.variants[0] && (
                              <button className="chat-chip sm" onClick={() => openVariant(r.variants[0].entityId)}>
                                פתח מק"ט
                              </button>
                            )}
                            <button className="chat-chip sm" onClick={() => openInPage(r.catalogNumber)}>
                              ↗ הצג בעמוד
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {showCards && m.suppliers && m.suppliers.length > 0 && (
                    <div className="chat-results">
                      {m.suppliers.map((s, i) => (
                        <div
                          className="chat-result chat-supplier"
                          style={{ animationDelay: `${i * 60}ms` }}
                          key={s.modSupplierId}
                        >
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
                          <div className="chat-actions">
                            {phoneOf(s) !== '—' && (
                              <button className="chat-chip sm" onClick={() => copyPhone(s)}>
                                העתק טלפון
                              </button>
                            )}
                            {s.city && (
                              <a
                                className="chat-chip sm"
                                href={navUrl(s)}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                נווט
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {loading && (
              <div className="chat-msg bot chat-typing-msg">
                <span className="chat-typing">
                  <i />
                  <i />
                  <i />
                </span>
                {pendingIntent && <span className="chat-typing-label">{TYPING_MICROCOPY[pendingIntent]}</span>}
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
