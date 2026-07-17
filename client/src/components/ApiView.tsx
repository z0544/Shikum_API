import { useApp } from '../state/AppContext';
import { Breadcrumbs } from './Header';
import { Icon } from './icons';

interface Endpoint {
  method: 'GET' | 'POST';
  path: string;
  title: string;
  desc: string;
  params?: string[];
  curl: (origin: string) => string;
  sample?: string;
}

const SAMPLE_MAKAT = '11089';
const SAMPLE_MABAR = '92593';

const ENDPOINTS: Endpoint[] = [
  {
    method: 'GET',
    path: '/api/makt/:makt/mabar',
    title: 'מק"ט → קוד מב"ר',
    desc: 'מקבל מק"ט ומחזיר את קוד ההפניה מב"ר (קוד השירות/מחירון) שלו.',
    params: [':makt — מספר המק"ט'],
    curl: (o) => `curl '${o}/api/makt/${SAMPLE_MAKAT}/mabar'`,
    sample: `{ "catalogNumber": "11089", "mabarCode": "92593" }`,
  },
  {
    method: 'GET',
    path: '/api/mabar/:code/makt',
    title: 'קוד מב"ר → מק"טים (הפוך)',
    desc: 'מקבל קוד מב"ר ומחזיר את כל המק"טים המשויכים אליו. קוד יחיד עשוי לכסות כמה מק"טים.',
    params: [':code — קוד מב"ר'],
    curl: (o) => `curl '${o}/api/mabar/${SAMPLE_MABAR}/makt'`,
    sample: `{ "mabarCode": "92593", "count": 1, "catalogNumbers": ["11089"] }`,
  },
  {
    method: 'GET',
    path: '/api/makt/:makt/service-code',
    title: 'קוד שירות של מק"ט',
    desc: 'זהה בערכו ל-mabar — מחזיר את קוד השירות (catalogPricelistNum) של המק"ט.',
    params: [':makt — מספר המק"ט'],
    curl: (o) => `curl '${o}/api/makt/${SAMPLE_MAKAT}/service-code'`,
    sample: `{ "catalogNumber": "11089", "serviceCode": "92593" }`,
  },
  {
    method: 'GET',
    path: '/api/makt/:makt/suppliers',
    title: 'ספקים מורשים למק"ט',
    desc: 'מחזיר את רשימת הספקים המורשים (מתוך ההסכמים) עבור המק"ט.',
    params: [':makt — מספר המק"ט'],
    curl: (o) => `curl '${o}/api/makt/${SAMPLE_MAKAT}/suppliers'`,
    sample: `{ "catalogNumber": "11089", "count": 8, "suppliers": [ … ] }`,
  },
  {
    method: 'GET',
    path: '/api/makt/:makt/institutions',
    title: 'מרכזים רפואיים למק"ט',
    desc: 'ספקי ההסכם מועשרים מספריית myshikum (שם, סוג, עיר, טלפון, מקצוע, גיאו).',
    params: [':makt — מספר המק"ט'],
    curl: (o) => `curl '${o}/api/makt/${SAMPLE_MAKAT}/institutions'`,
    sample: `{ "catalogNumber": "11089", "count": 8, "institutions": [ … ] }`,
  },
  {
    method: 'GET',
    path: '/api/item/:entityId',
    title: 'פרטי וריאנט',
    desc: 'פרטי וריאנט מלאים לפי מזהה, כולל ספקים מורשים והיסטוריית שינויים.',
    params: [':entityId — מזהה הווריאנט (למשל 11089-0-0-0-0)'],
    curl: (o) => `curl '${o}/api/item/${SAMPLE_MAKAT}-0-0-0-0'`,
  },
  {
    method: 'GET',
    path: '/api/items',
    title: 'חיפוש מק"טים',
    desc: 'חיפוש טקסט לפי מק"ט/תיאור/ספק. פרמטרים ב-query string.',
    params: ['q — טקסט חיפוש', 'match — contains|startswith|endswith|exact', 'field — all|מקט|ספק…', 'grouped — true|false'],
    curl: (o) => `curl '${o}/api/items?q=${encodeURIComponent('מכשיר שמיעה')}&match=contains&field=all&grouped=true'`,
  },
  {
    method: 'POST',
    path: '/api/ai/search',
    title: 'חיפוש חכם (AI)',
    desc: 'חיפוש מבוסס Gemini — מחלץ מילים ומיקום ומדרג מק"טים וספקים.',
    curl: (o) =>
      `curl -X POST '${o}/api/ai/search' \\\n  -H 'Content-Type: application/json' \\\n  -d '${JSON.stringify({ query: 'בדיקת מכשיר שמיעה' })}'`,
  },
  {
    method: 'POST',
    path: '/api/ai/chat',
    title: 'צ\'אט (עוזר חכם)',
    desc: 'שיחה עם זיכרון הקשר. שולחים message + context (שמוחזר מהתגובה הקודמת).',
    curl: (o) =>
      `curl -X POST '${o}/api/ai/chat' \\\n  -H 'Content-Type: application/json' \\\n  -d '${JSON.stringify({ message: 'מי מספק?', context: { makat: SAMPLE_MAKAT } })}'`,
  },
  {
    method: 'GET',
    path: '/api/export/makt/:makt',
    title: 'ייצוא מק"ט + ספקים (Excel)',
    desc: 'מוריד קובץ Excel של המק"ט והספקים המורשים.',
    params: [':makt — מספר המק"ט', 'entity_id — מזהה וריאנט (אופציונלי)'],
    curl: (o) => `curl -OJ '${o}/api/export/makt/${SAMPLE_MAKAT}'`,
  },
];

export function ApiView() {
  const { showToast } = useApp();
  const origin = window.location.origin;

  function copy(text: string) {
    navigator.clipboard
      ?.writeText(text)
      .then(() => showToast('פקודת cURL הועתקה', 'ok'))
      .catch(() => showToast('לא ניתן להעתיק', 'error'));
  }

  return (
    <>
      <Breadcrumbs trail={['דף הבית', 'API — ממשק תכנותי']} />
      <main>
        <section className="card">
          <div className="panel-head">
            <h2>API — ממשק תכנותי</h2>
            <span className="count-pill">{ENDPOINTS.length} endpoints</span>
          </div>
          <p style={{ marginTop: 0 }}>
            כל נקודות הקצה הציבוריות של המערכת, עם פקודות cURL להעתקה. הבסיס:{' '}
            <code>{origin}</code>. הדוגמאות משתמשות במק"ט <code>{SAMPLE_MAKAT}</code> וקוד מב"ר{' '}
            <code>{SAMPLE_MABAR}</code>.
          </p>
        </section>

        {ENDPOINTS.map((e) => {
          const cmd = e.curl(origin);
          return (
            <section className="card" key={e.method + e.path}>
              <div className="panel-head">
                <h3 style={{ margin: 0 }}>
                  <span className={`chip ${e.method === 'GET' ? 'green' : 'amber'}`}>{e.method}</span>{' '}
                  {e.title}
                </h3>
                <code style={{ fontFamily: 'monospace', opacity: 0.8 }}>{e.path}</code>
              </div>
              <p style={{ marginTop: 0 }}>{e.desc}</p>
              {e.params && e.params.length > 0 && (
                <ul className="hint" style={{ marginTop: 0 }}>
                  {e.params.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              )}
              <pre className="curl-block">{cmd}</pre>
              {e.sample && (
                <pre className="curl-block" style={{ opacity: 0.85 }}>
                  {'// תגובה לדוגמה\n' + e.sample}
                </pre>
              )}
              <div className="chat-report-actions">
                <button className="btn btn-primary btn-sm" onClick={() => copy(cmd)}>
                  <Icon name="copy" /> העתק cURL
                </button>
              </div>
            </section>
          );
        })}
      </main>
    </>
  );
}
