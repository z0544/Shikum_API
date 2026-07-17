#!/usr/bin/env node
// ETL prototype: משיכת ספריית הספקים הציבורית של אגף השיקום (myshikum) והפיכתה
// לטבלת ספקים/מרכזים רפואיים מועשרת, מוכנה ל-JOIN מול טבלת ה-Agreements הקיימת
// (modSupplierId ↔ catalogNumber) כדי לענות: "אילו מרכזים נותנים שירות לקוד X".
//
// מקור: https://myshikum.mod.gov.il/api  — ציבורי, ללא אימות (אומת חי 2026-07-17).
// הרצה:  node server/scripts/myshikum-provider-etl.mjs [--out providers.json]
// דורש Node 18+ (fetch גלובלי). ללא תלויות חיצוניות.

const BASE = 'https://myshikum.mod.gov.il/api';
const UA = 'Mozilla/5.0 (Shikum_API provider-directory ETL; contact: admin)';

// קטגוריות רפואיות/פרא-רפואיות + שם שדה הסינון (queryName) של כל אחת.
// lawyers הושמט בכוונה (אינו רפואי).
const CATEGORIES = [
  { category: 'doctors', queryName: 'specialty', resourceKey: 'doctors' },
  { category: 'paramedical', queryName: 'profession', resourceKey: 'paramedical-occupations' },
  { category: 'mental', queryName: 'profession', resourceKey: 'mental-occupations' },
  { category: 'medicalService', queryName: 'profession', resourceKey: 'medicalService-occupations' },
  { category: 'imagingInstitutes', queryName: 'specialty', resourceKey: 'imagingInstitutes' },
  { category: 'labTests', queryName: 'specialty', resourceKey: 'labTests-occupations' },
];

async function api(path) {
  const res = await fetch(`${BASE}/${path}`, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for /${path}`);
  return res.json();
}

// חלק מהקטגוריות מחזירות אובייקט רב-מימדי (LNGCD/specialty), חלק {resources:[...]}.
function flattenResources(payload) {
  const map = {};
  const collect = (arr) => arr?.forEach((r) => (map[r.resourceId] = String(r.content).trim()));
  if (Array.isArray(payload?.resources)) collect(payload.resources);
  else if (payload && typeof payload === 'object')
    for (const v of Object.values(payload)) if (Array.isArray(v?.resources)) collect(v.resources);
  return map;
}

function phone(s) {
  const p = String(s.workPhonePrefix || s.homePhonePrefix || s.cellPhonePrefix || '').trim();
  const n = String(s.workPhoneNumber || s.homePhoneNumber || s.cellPhoneNumber || '').trim();
  return p && n ? `${p}-${n}` : null;
}

// מפתח ה-JOIN: ה-id ב-myshikum הוא מספר ספק השיקום (rehabSupplierId), לא ה-SAP בן 10 הספרות.
// במאגר: הצטלבות מול Agreement.rehabSupplierId / Supplier.rehabSupplierId (לא modSupplierId!).
// נרמול לערך מספרי מבטיח התאמה ("000357" == "357").
export const joinKey = (id) => String(parseInt(String(id), 10));

async function run() {
  const out = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : null;
  const cities = Object.fromEntries((await api('GeneralOptions/Cities')).map((c) => [c.id, c.value.trim()]));
  console.error(`ערים: ${Object.keys(cities).length}`);

  const providers = {};
  for (const cat of CATEGORIES) {
    let occ = {};
    try { occ = flattenResources(await api(`SupplierResources/${cat.resourceKey}`)); } catch { /* optional */ }
    let list = [];
    try { list = await api(`Suppliers/${cat.category}`); } catch (e) { console.error(`  דילוג ${cat.category}: ${e.message}`); }
    // קטגוריות imaging/lab מחזירות רשימה רק עם specialty — נמשך per-resource.
    if ((!list || list.length === 0) && Object.keys(occ).length) {
      const merged = {};
      for (const rid of Object.keys(occ)) {
        try { (await api(`Suppliers/${cat.category}?${cat.queryName}=${rid}`)).forEach((s) => (merged[s.id] = s)); } catch { /* */ }
      }
      list = Object.values(merged);
    }
    for (const s of list || []) {
      const key = joinKey(s.id);
      const professions = (s.professions || []).map((p) => occ[p]).filter(Boolean);
      providers[key] = providers[key] || {
        rehabSupplierId: key,
        rawId: s.id,
        name: String(s.name || '').trim(),
        categories: [],
        professions: [],
        city: cities[s.firstCityId] || null,
        street: [String(s.firstStreet || '').trim(), String(s.firstHouseNumber || '').trim()].filter(Boolean).join(' '),
        zip: String(s.firstZipCode || '').trim() || null,
        phone: phone(s),
        email: s.email || null,
        homeVisit: !!s.hasHomeVisit,
        accessible: !!s.hasAccessibilityForHandicapped,
        source: 'myshikum.mod.gov.il',
      };
      if (!providers[key].categories.includes(cat.category)) providers[key].categories.push(cat.category);
      for (const pr of professions) if (!providers[key].professions.includes(pr)) providers[key].professions.push(pr);
    }
    console.error(`  ${cat.category}: ${(list || []).length} ספקים`);
  }

  const rows = Object.values(providers);
  console.error(`\nסה"כ ספקים ייחודיים בהסדר עם אגף השיקום: ${rows.length}`);
  const json = JSON.stringify(rows, null, 2);
  if (out) { const fs = await import('node:fs'); fs.writeFileSync(out, json); console.error(`נכתב אל ${out}`); }
  else process.stdout.write(json);
}

// ה-JOIN לתשובת ה-API (פסאודו): לקוד שירות X
//   SELECT modSupplierId FROM agreements WHERE catalogNumber = X AND isActive
//   → providers[joinKey(modSupplierId)]  → שם/כתובת/עיר/טלפון/מקצוע של כל מרכז.
// לבתי חולים per-מק"ט (למשל 27288 → רמב"ם/איכילוב) — seed מנספחי ה-PDF של האגף.

run().catch((e) => { console.error(e); process.exit(1); });
