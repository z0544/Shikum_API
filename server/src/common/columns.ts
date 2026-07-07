/**
 * מיפוי כותרות עבריות בקובצי ה-XLSX -> שדות אנגליים נקיים ב-DB,
 * ותוויות עבריות לתצוגה. מקביל ל-COLUMN_ALIASES / HEADER_MARKERS במקור.
 */

export type FileKind = 'items' | 'suppliers' | 'agreements';

/** נרמול שם עמודה: הסרת רווחים כפולים ונקודות מובילות/סופיות (כמו normalize_column_name). */
export function normalizeColumnName(name: unknown): string {
  if (name === null || name === undefined) return '';
  let text = String(name).trim();
  // הסרת נקודות בקצוות (הקבצים מכילים "תיאור פריט." ו-".סוג זכאי")
  text = text.replace(/^\.+/, '').replace(/\.+$/, '');
  text = text.replace(/\s+/g, ' ').trim();
  return text;
}

/** שם קנוני (אנגלי) -> וריאציות עבריות אפשריות (לאחר נרמול). */
type AliasMap = Record<string, string[]>;

export const ITEM_ALIASES: AliasMap = {
  catalogNumber: ['מק"ט', 'מק"ט פריט', "מק'ט פריט", 'מקט'],
  description: ['תיאור פריט'],
  entitlementFrequency: ['תדירות זכאות'],
  quantityPerPeriod: ['כמות בתקופת זכאות'],
  maxQuantity: ['כמות מירבית', 'כמות מרבית'],
  entitledTypeRaw: ['סוג זכאי'],
  amountTypeRaw: ['סוג סכום'],
  baseLevel: ['רמת בסיס'],
  exceptionLevel: ['רמת חריגה'],
  exceptionPercent: ['אחוז לחריגה'],
  amount: ['סכום'],
};

export const SUPPLIER_ALIASES: AliasMap = {
  validFrom: ['תחילת תוקף'],
  validTo: ['סיום תוקף'],
  rehabSupplierId: ['מספר ספק שיקום', "מס' ספק שיקום"],
  modSupplierId: ['מספר ספק משהב"ט', "מס' ספק משהב\"ט", 'מספר ספק'],
  name: ['שם ספק'],
  city: [
    'ישוב קליניקה/סאפ/דואר/מגורים ספק',
    'יישוב קליניקה/סאפ/דואר/מגורים ספק',
    'יישוב קליניקה',
    'ישוב קליניקה',
  ],
  street: [
    'רחוב ומס בית קליניקה/סאפ/דואר/מגורים ספק',
    'רחוב ומס בית',
    'רחוב ומספר בית',
  ],
  mobile: ['נייד ספק', 'נייד'],
  workPhone: ['טלפון עבודה ספק', 'טלפון עבודה'],
  landline: ['נייח ספק', 'נייח'],
  email: ['כתובת דוא"ל ספק', 'דוא"ל', 'כתובת דואל ספק'],
  profession: ['מקצוע ספק', 'מקצוע'],
  specialization: ['התמחות ספק', 'התמחות'],
  subSpecialization: ['תת התמחות ספק', 'תת התמחות'],
  therapeuticApproach: ['גישה טיפולית ספק', 'גישה טיפולית'],
};

export const AGREEMENT_ALIASES: AliasMap = {
  rehabSupplierId: ["מס' ספק שיקום", 'מספר ספק שיקום'],
  modSupplierId: ['מספר ספק משהב"ט', "מס' ספק משהב\"ט", 'מספר ספק'],
  catalogNumber: ['מק"ט פריט', 'מק"ט', 'מקט'],
  isActiveRaw: ['האם בתוקף'],
  suppliersPerMakt: ['כמה ספקים לכל מקט', 'כמות ספקים לכל מקט'],
};

export const ALIASES_BY_KIND: Record<FileKind, AliasMap> = {
  items: ITEM_ALIASES,
  suppliers: SUPPLIER_ALIASES,
  agreements: AGREEMENT_ALIASES,
};

/** סמנים לזיהוי שורת הכותרת בכל קובץ. */
export const HEADER_MARKERS: Record<FileKind, string[]> = {
  items: ['מק"ט'],
  suppliers: ['מספר ספק משהב"ט', 'שם ספק'],
  agreements: ['מק"ט פריט', 'מספר ספק משהב"ט'],
};

/**
 * בונה מיפוי מ-header-index -> canonical field, לפי הכותרות שנמצאו בקובץ.
 * מחזיר גם את הרשימה הגולמית לצורך זיהוי עמודות לא ממופות.
 */
export function buildHeaderMap(headers: unknown[], kind: FileKind): Record<number, string> {
  const aliases = ALIASES_BY_KIND[kind];
  // normalized alias -> canonical
  const aliasToCanonical = new Map<string, string>();
  for (const [canonical, variants] of Object.entries(aliases)) {
    for (const v of variants) {
      aliasToCanonical.set(normalizeColumnName(v), canonical);
    }
  }
  const map: Record<number, string> = {};
  const used = new Set<string>();
  headers.forEach((h, idx) => {
    const norm = normalizeColumnName(h);
    if (!norm) return;
    const canonical = aliasToCanonical.get(norm);
    if (canonical && !used.has(canonical)) {
      map[idx] = canonical;
      used.add(canonical);
    }
  });
  return map;
}

/** תוויות עבריות לתצוגה — משמשות את ה-UI וייצוא ה-Excel. */
export const ITEM_LABELS: Record<string, string> = {
  entityId: 'מזהה וריאנט',
  catalogNumber: 'מק"ט',
  description: 'תיאור פריט',
  entitlementFrequency: 'תדירות זכאות',
  quantityPerPeriod: 'כמות בתקופת זכאות',
  maxQuantity: 'כמות מירבית',
  entitledTypeRaw: 'סוג זכאי',
  entitledType: 'קוד סוג זכאי',
  amountTypeRaw: 'סוג סכום',
  amountType: 'קוד סוג סכום',
  baseLevel: 'רמת בסיס',
  exceptionLevel: 'רמת חריגה',
  exceptionPercent: 'אחוז לחריגה',
  amount: 'סכום',
};

export const SUPPLIER_LABELS: Record<string, string> = {
  modSupplierId: 'מספר ספק',
  rehabSupplierId: 'מספר ספק שיקום',
  name: 'שם ספק',
  city: 'יישוב',
  street: 'רחוב ומספר בית',
  mobile: 'נייד',
  workPhone: 'טלפון עבודה',
  landline: 'נייח',
  email: 'דוא"ל',
  profession: 'מקצוע',
  specialization: 'התמחות',
  subSpecialization: 'תת התמחות',
  therapeuticApproach: 'גישה טיפולית',
  district: 'מחוז',
  validFrom: 'תחילת תוקף',
  validTo: 'סיום תוקף',
};
