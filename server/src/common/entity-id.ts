/**
 * בניית ה-Variant ID המספרי (instructions §4).
 * פורמט: catalogNumber-entitledType-amountType-baseLevel-exceptionLevel
 * כל חלק הוא INT. דוגמה: 642-1-1-1-0.
 */

export const ENTITY_ID_SEPARATOR = '-';

/**
 * נרמול ערך ל"מספר שלם כמחרוזת" ככל הניתן:
 * "1.0" -> "1", "  3 " -> "3", ריק/NaN/#MULTIVALUE -> "0".
 */
export function normalizeIntPart(value: unknown): string {
  if (value === null || value === undefined) return '0';
  const s = String(value).trim();
  if (!s || ['nan', 'none', '<na>', '#multivalue'].includes(s.toLowerCase())) return '0';
  const f = Number(s);
  if (!Number.isNaN(f) && Number.isFinite(f)) {
    return String(Math.trunc(f));
  }
  // לא מספרי (למשל טקסט חופשי) — לפי המדיניות, כל חלק ב-ID חייב להיות INT.
  return '0';
}

/** נרמול מק"ט: שומר מספר אם מספרי, אחרת מחזיר את המחרוזת המנוקה. */
export function normalizeCatalogNumber(value: unknown): string {
  if (value === null || value === undefined) return '0';
  const s = String(value).trim();
  if (!s) return '0';
  const f = Number(s);
  if (!Number.isNaN(f) && Number.isFinite(f) && Number.isInteger(f)) {
    return String(f);
  }
  return s;
}

/**
 * נרמול מספר ספק משהב"ט למפתח JOIN יציב: myshikum מרפד ל-6 ספרות ("000357")
 * וקבצי ה-XLSX שומרים trimmed ("357"). נרמול לערך מספרי מיישר בין המקורות.
 * ערך לא-מספרי מוחזר כפי שהוא (מנוקה).
 */
export function normalizeSupplierId(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value).trim();
  if (!s) return '';
  const n = Number(s);
  if (!Number.isNaN(n) && Number.isFinite(n) && Number.isInteger(n)) return String(n);
  return s;
}

export interface EntityIdParts {
  catalogNumber: string | number;
  entitledType: number;
  amountType: number;
  baseLevel: number | string;
  exceptionLevel: number | string;
}

/** בונה את ה-Variant ID מחלקים מספריים. */
export function buildEntityId(parts: EntityIdParts): string {
  return [
    normalizeCatalogNumber(parts.catalogNumber),
    normalizeIntPart(parts.entitledType),
    normalizeIntPart(parts.amountType),
    normalizeIntPart(parts.baseLevel),
    normalizeIntPart(parts.exceptionLevel),
  ].join(ENTITY_ID_SEPARATOR);
}

/**
 * תאימות לאחור: מזהה ישן במקור השתמש במפריד '_' עם סדר שדות שונה
 * (מק"ט_רמת בסיס_רמת חריגה_אחוז לחריגה_סוג זכאי_סוג סכום) עם טקסט עברי.
 * לא ניתן להמיר טקסט->INT כאן ללא ה-config, לכן זה משמש רק לזיהוי פורמט ישן.
 */
export function isLegacyEntityId(entityId: string): boolean {
  return entityId.includes('_');
}
