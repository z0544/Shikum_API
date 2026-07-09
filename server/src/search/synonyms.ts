import { normalizeHebrew } from '../common/hebrew';

/**
 * מילון נרדפות ארגוני — מיפוי שפת דיבור/סלנג למונחים הרשמיים בקטלוג.
 * ניתן להרחבה. המפתחות מנורמלים אוטומטית (אותיות סופיות/רווחים).
 */
export const SYNONYMS: Record<string, string[]> = {
  'כסא גלגלים': ['כיסא גלגלים'],
  'כיסא ממונע': ['כיסא גלגלים ממונע', 'ממונע'],
  עגלה: ['כיסא גלגלים'],
  משקפיים: ['עדשות', 'משקפי'],
  'משקפי ראייה': ['עדשות', 'משקפי'],
  'מכשיר שמיעה': ['שמיעה', 'שמע'],
  שמיעה: ['מכשיר שמיעה'],
  קביים: ['קב', 'הליכה'],
  הליכון: ['הליכה', 'רולטור'],
  'טיפול נפשי': ['טיפול פסיכולוגי', 'פסיכולוגי'],
  פסיכולוג: ['טיפול פסיכולוגי', 'פסיכולוגי'],
  'טיפול רגשי': ['טיפול פסיכולוגי', 'רגשי'],
  שיניים: ['שיקום פה', 'שיניים'],
  דיור: ['דיור', 'שיכון'],
  ריהוט: ['ריהוט', 'ציוד'],
};

let normIndex: Map<string, string[]> | null = null;

function index(): Map<string, string[]> {
  if (normIndex) return normIndex;
  normIndex = new Map();
  for (const [k, vals] of Object.entries(SYNONYMS)) normIndex.set(normalizeHebrew(k), vals);
  return normIndex;
}

/** מחזיר מונחים רשמיים נרדפים עבור ביטוי או מילה (התאמה מלאה + לפי מילה). */
export function synonymsFor(text: string): string[] {
  const idx = index();
  const norm = normalizeHebrew(text);
  if (!norm) return [];
  const out = new Set<string>();
  if (idx.has(norm)) idx.get(norm)!.forEach((v) => out.add(v));
  for (const w of norm.split(' ')) if (idx.has(w)) idx.get(w)!.forEach((v) => out.add(v));
  return [...out];
}
