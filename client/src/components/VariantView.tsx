import { useEffect, useState } from 'react';
import { useApp } from '../state/AppContext';
import { Breadcrumbs } from './Header';
import { DetailPanel } from './DetailPanel';
import { Icon } from './icons';

/**
 * תצוגת וריאנט בודד ייעודית — נגישה ישירות דרך URL (#/variant/<entityId>)
 * וניתנת לשיתוף. מציגה פרטי וריאנט, ספקים מורשים והיסטוריה ללא צורך בחיפוש.
 */
export function VariantView() {
  const { variantId, openVariant, setView, showToast } = useApp();
  const [input, setInput] = useState(variantId ?? '');
  const [catalogNumber, setCatalogNumber] = useState<string | null>(null);

  // סנכרון תיבת הקלט עם המזהה שב-URL (למשל בעת הגעה מ-deep-link).
  useEffect(() => {
    setInput(variantId ?? '');
    setCatalogNumber(null);
  }, [variantId]);

  function go() {
    const id = input.trim();
    if (id) openVariant(id);
  }

  /**
   * מעתיק קישור לדף הווריאנט. בגוף עשיר (מייל/וורד) מודבק כעוגן HTML שטקסט
   * התצוגה שלו הוא המק"ט בלבד; בטקסט רגיל מודבק ה-URL המלא.
   */
  async function copyLink() {
    const url = window.location.href;
    const makt = catalogNumber ?? (variantId ? variantId.split('-')[0] : '');
    const esc = (s: string) =>
      s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    const html = `<a href="${esc(url)}">${esc(makt)}</a>`;
    try {
      if (
        navigator.clipboard &&
        'write' in navigator.clipboard &&
        typeof ClipboardItem !== 'undefined'
      ) {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': new Blob([html], { type: 'text/html' }),
            'text/plain': new Blob([url], { type: 'text/plain' }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(url);
      }
      showToast(makt ? `הקישור למק"ט ${makt} הועתק` : 'הקישור הועתק', 'ok');
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
                <Icon name="link" /> העתק קישור
              </button>
            )}
            <button className="btn btn-ghost" onClick={() => setView('search')}>
              <Icon name="chevron-left" /> חזרה לחיפוש
            </button>
          </div>
          <p className="hint">
            הזן מזהה וריאנט מלא כדי להציג את פרטיו, ספקיו המורשים והיסטוריית השינויים — ללא חיפוש מקדים.
            ניתן לשתף את כתובת הדף להגעה ישירה לווריאנט.
          </p>
        </section>

        {variantId ? (
          <DetailPanel entityId={variantId} onLoaded={(it) => setCatalogNumber(it.catalogNumber)} />
        ) : (
          <section className="card">
            <p className="empty-state">הזן מזהה וריאנט למעלה כדי להציג את הפרטים</p>
          </section>
        )}
      </main>
    </>
  );
}
