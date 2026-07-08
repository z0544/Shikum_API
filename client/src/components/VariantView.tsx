import { useEffect, useState } from 'react';
import { useApp } from '../state/AppContext';
import { Breadcrumbs } from './Header';
import { DetailPanel } from './DetailPanel';

/**
 * תצוגת וריאנט בודד ייעודית — נגישה ישירות דרך URL (#/variant/<entityId>)
 * וניתנת לשיתוף. מציגה פרטי וריאנט, ספקים מורשים והיסטוריה ללא צורך בחיפוש.
 */
export function VariantView() {
  const { variantId, openVariant, setView, showToast } = useApp();
  const [input, setInput] = useState(variantId ?? '');

  // סנכרון תיבת הקלט עם המזהה שב-URL (למשל בעת הגעה מ-deep-link).
  useEffect(() => {
    setInput(variantId ?? '');
  }, [variantId]);

  function go() {
    const id = input.trim();
    if (id) openVariant(id);
  }

  async function copyLink() {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      showToast('הקישור הועתק', 'ok');
    } catch {
      // דפדפנים ללא הרשאת clipboard (למשל ללא HTTPS) — נפילה חלופה לבחירה ידנית.
      window.prompt('העתק את הקישור:', url);
    }
  }

  return (
    <>
      <Breadcrumbs trail={['דף הבית', 'תצוגת וריאנט', variantId || '—']} />
      <main>
        <section className="card">
          <div className="search-row">
            <div className="field grow">
              <label>מזהה וריאנט (Variant ID)</label>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && go()}
                placeholder='לדוגמה: 642-1-1-1-0'
                dir="ltr"
                type="search"
              />
            </div>
            <button className="btn btn-primary" onClick={go}>
              הצג וריאנט
            </button>
            {variantId && (
              <button className="btn btn-green" onClick={copyLink} title="העתק קישור ישיר לווריאנט זה">
                🔗 העתק קישור
              </button>
            )}
            <button className="btn btn-ghost" onClick={() => setView('search')}>
              ← חזרה לחיפוש
            </button>
          </div>
          <p className="hint">
            הזן מזהה וריאנט מלא כדי להציג את פרטיו, ספקיו המורשים והיסטוריית השינויים — ללא חיפוש מקדים.
            ניתן לשתף את כתובת הדף להגעה ישירה לווריאנט.
          </p>
        </section>

        {variantId ? (
          <DetailPanel entityId={variantId} />
        ) : (
          <section className="card">
            <p className="empty-state">הזן מזהה וריאנט למעלה כדי להציג את הפרטים</p>
          </section>
        )}
      </main>
    </>
  );
}
