/** מצבי התאמה לחיפוש (כולל aliases בעברית לתאימות למקור). */
export type MatchMode = 'contains' | 'exact' | 'startswith' | 'endswith';

export const MATCH_ALIASES: Record<string, MatchMode> = {
  contains: 'contains',
  מכיל: 'contains',
  exact: 'exact',
  שווה: 'exact',
  '=': 'exact',
  startswith: 'startswith',
  מתחיל: 'startswith',
  endswith: 'endswith',
  מסתיים: 'endswith',
};

/** שדות חיפוש נתמכים -> שדה DB (או 'supplier'/'all' מיוחדים). */
export const FIELD_ALIASES: Record<string, string> = {
  all: 'all',
  entityid: 'entityId',
  entity_id: 'entityId',
  catalognumber: 'catalogNumber',
  מקט: 'catalogNumber',
  makt: 'catalogNumber',
  sku: 'catalogNumber',
  description: 'description',
  תיאור: 'description',
  entitledtype: 'entitledTypeRaw',
  זכאי: 'entitledTypeRaw',
  supplier: 'supplier',
  ספק: 'supplier',
};

export function parseMatchMode(match: string): MatchMode {
  const key = (match || '').trim().toLowerCase();
  const mode = MATCH_ALIASES[key];
  if (!mode) throw new Error(`מצב התאמה לא תקין: ${match}`);
  return mode;
}

export function parseField(field: string): string {
  const key = (field || '').trim().toLowerCase();
  const resolved = FIELD_ALIASES[key];
  if (!resolved) throw new Error(`שדה לא תקין: ${field}`);
  return resolved;
}

/** בונה תנאי Prisma string לפי מצב ההתאמה. */
export function stringFilter(mode: MatchMode, value: string) {
  switch (mode) {
    case 'exact':
      return { equals: value };
    case 'startswith':
      return { startsWith: value };
    case 'endswith':
      return { endsWith: value };
    default:
      return { contains: value };
  }
}
