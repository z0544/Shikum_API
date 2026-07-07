/**
 * ניקוי ערכים לתצוגה — מקביל ל-utils.py במקור.
 * ערכים ריקים / NaN / null מומרים ל-"לא מוגדר" (או מוסתרים).
 */

export const UNDEFINED_LABEL = 'לא מוגדר';

export function cleanValue(value: unknown): unknown {
  if (value === null || value === undefined) return UNDEFINED_LABEL;
  if (typeof value === 'number' && Number.isNaN(value)) return UNDEFINED_LABEL;
  if (typeof value === 'string') {
    const t = value.trim().toLowerCase();
    if (t === 'nan' || t === 'none' || t === '' || t === '<na>') return UNDEFINED_LABEL;
  }
  return value;
}

export function cleanRecord<T extends Record<string, unknown>>(
  record: T,
  opts: { hideUndefined?: boolean } = {},
): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(record)) {
    cleaned[key] = cleanValue(val);
  }
  if (opts.hideUndefined) {
    const filtered: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(cleaned)) {
      if (v !== UNDEFINED_LABEL) filtered[k] = v;
    }
    return filtered;
  }
  return cleaned;
}
