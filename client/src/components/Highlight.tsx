import { Fragment, type ReactNode } from 'react';

/** מפריד מונחי חיפוש (מסיר תחיליות/סימנים קצרים) להדגשה. */
function toTerms(query: string): string[] {
  return [
    ...new Set(
      (query || '')
        .split(/[\s,]+/)
        .map((t) => t.replace(/["'()]/g, '').trim())
        .filter((t) => t.length >= 2),
    ),
  ];
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * מדגיש את מונחי החיפוש בתוך טקסט (case-insensitive). מחזיר את הטקסט כפי שהוא
 * אם אין מונחים תואמים — כדי לא לשבור תצוגה.
 */
export function Highlight({ text, query }: { text: string | null | undefined; query: string }): ReactNode {
  const value = text ?? '';
  const terms = toTerms(query);
  if (!value || !terms.length) return value;
  const re = new RegExp(`(${terms.map(escapeRegex).join('|')})`, 'gi');
  const termSet = new Set(terms.map((t) => t.toLowerCase()));
  const parts = value.split(re);
  return parts.map((part, i) =>
    part && termSet.has(part.toLowerCase()) ? (
      <mark className="hl" key={i}>
        {part}
      </mark>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}
