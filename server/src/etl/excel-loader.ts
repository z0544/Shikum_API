import * as XLSX from 'xlsx';
import { buildHeaderMap, FileKind, HEADER_MARKERS, normalizeColumnName } from '../common/columns';

/** רשומה גולמית ממופה לשדות קנוניים (אנגלית). */
export type RawRecord = Record<string, string | null>;

function cellToStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

/** מזהה את שורת הכותרת לפי סמנים (כמו _find_header_row). */
function findHeaderRow(rows: unknown[][], markers: string[]): number {
  const normMarkers = new Set(markers.map(normalizeColumnName));
  const scan = Math.min(rows.length, 30);
  for (let i = 0; i < scan; i++) {
    const rowValues = new Set(
      (rows[i] || []).filter((v) => v !== null && v !== undefined).map(normalizeColumnName),
    );
    for (const m of normMarkers) {
      if (rowValues.has(m)) return i;
    }
  }
  return 0;
}

/**
 * קורא קובץ XLSX/CSV (מנתיב או מ-Buffer) וממפה לשדות קנוניים.
 * מזהה אוטומטית את שורת הכותרת ומנרמל את שמות העמודות.
 */
export function readKmsFile(source: string | Buffer, kind: FileKind): RawRecord[] {
  const wb =
    typeof source === 'string'
      ? XLSX.readFile(source, { cellDates: false, raw: false })
      : XLSX.read(source, { type: 'buffer', cellDates: false, raw: false });

  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    blankrows: false,
    raw: false,
  });

  if (!rows.length) return [];

  const markers = HEADER_MARKERS[kind];
  const headerRow = findHeaderRow(rows, markers);
  const headers = (rows[headerRow] || []) as unknown[];
  const headerMap = buildHeaderMap(headers, kind);

  const records: RawRecord[] = [];
  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const rec: RawRecord = {};
    let hasAny = false;
    for (const [idxStr, field] of Object.entries(headerMap)) {
      const idx = Number(idxStr);
      const val = cellToStr(row[idx]);
      rec[field] = val;
      if (val !== null) hasAny = true;
    }
    if (!hasAny) continue;

    // סינון שורות ללא מפתח ראשי
    if (kind === 'items' && !rec['catalogNumber']) continue;
    if (kind === 'suppliers' && !rec['modSupplierId']) continue;
    if (kind === 'agreements' && (!rec['catalogNumber'] || !rec['modSupplierId'])) continue;

    records.push(rec);
  }
  return records;
}

/** בודק שהעמודות הנדרשות קיימות בקובץ (לוולידציה של העלאות). */
export function assertRequiredColumns(records: RawRecord[], required: string[]): void {
  if (!records.length) throw new Error('הקובץ ריק או שלא זוהתה שורת כותרת');
  const present = new Set(Object.keys(records[0]));
  const missing = required.filter((c) => !present.has(c));
  if (missing.length) {
    throw new Error(`עמודות חסרות בקובץ: ${missing.join(', ')}`);
  }
}
