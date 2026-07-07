import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';

/** עמודות הווריאנט לייצוא (מפתח פנימי -> כותרת עברית). */
const VARIANT_COLUMNS: Array<[string, string]> = [
  ['entityId', 'מזהה וריאנט'],
  ['catalogNumber', 'מק"ט'],
  ['description', 'תיאור פריט'],
  ['entitledTypeRaw', 'סוג זכאי'],
  ['amountTypeRaw', 'סוג סכום'],
  ['baseLevel', 'רמת בסיס'],
  ['exceptionLevel', 'רמת חריגה'],
  ['exceptionPercent', 'אחוז לחריגה'],
  ['amount', 'סכום'],
];

const PHONE_KEYS = ['mobile', 'workPhone', 'landline'];

@Injectable()
export class ExportService {
  private nowHe(): string {
    return new Date().toISOString().slice(0, 16).replace('T', ' ');
  }

  private supplierPhone(s: Record<string, unknown>): string {
    for (const k of PHONE_KEYS) {
      const v = s[k];
      if (v) return String(v).trim();
    }
    return '';
  }

  private amountRange(variants: Array<Record<string, unknown>>): string {
    const nums: number[] = [];
    for (const v of variants) {
      const raw = v['amount'];
      if (raw === null || raw === undefined) continue;
      const n = Number(String(raw).replace(/,/g, ''));
      if (Number.isFinite(n)) nums.push(n);
    }
    if (!nums.length) return '';
    const lo = Math.min(...nums);
    const hi = Math.max(...nums);
    return lo === hi ? String(lo) : `${lo} – ${hi}`;
  }

  private writeMeta(ws: ExcelJS.Worksheet, rows: Array<[string, unknown]>): void {
    ws.views = [{ rightToLeft: true }];
    rows.forEach(([label, value], i) => {
      const r = ws.getRow(i + 1);
      r.getCell(1).value = label;
      r.getCell(1).font = { bold: true };
      r.getCell(2).value = (value ?? '') as ExcelJS.CellValue;
    });
    ws.getColumn(1).width = 24;
    ws.getColumn(2).width = 60;
  }

  private writeTable(ws: ExcelJS.Worksheet, headers: string[], rows: unknown[][]): void {
    ws.views = [{ rightToLeft: true }];
    const headerRow = ws.getRow(1);
    headers.forEach((h, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = h;
      cell.font = { bold: true };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    });
    rows.forEach((row, r) => {
      const wr = ws.getRow(r + 2);
      row.forEach((val, c) => {
        wr.getCell(c + 1).value = (val ?? '') as ExcelJS.CellValue;
      });
    });
    headers.forEach((h, i) => {
      let maxLen = h.length;
      for (let r = 0; r < Math.min(rows.length, 50); r++) {
        const v = rows[r][i];
        if (v != null) maxLen = Math.max(maxLen, Math.min(String(v).length, 80));
      }
      ws.getColumn(i + 1).width = Math.min(Math.max(maxLen + 2, 10), 48);
    });
  }

  private async toBuffer(wb: ExcelJS.Workbook): Promise<Buffer> {
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  /** ייצוא תוצאות חיפוש. */
  async buildSearchExport(params: {
    query: string;
    match: string;
    field: string;
    groups: Array<Record<string, any>>;
    items: Array<Record<string, any>>;
  }): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const meta = wb.addWorksheet('מידע');
    this.writeMeta(meta, [
      ['סוג ייצוא', 'תוצאות חיפוש'],
      ['תאריך ייצוא', this.nowHe()],
      ['שאילתה', params.query],
      ['התאמה', params.match],
      ['שדה', params.field],
      ['מספר מקטים', params.groups.length],
      ['מספר וריאנטים', params.items.length],
    ]);

    const wsMakt = wb.addWorksheet('מקטים');
    const maktHeaders = ['מק"ט', 'תיאור פריט', 'מספר וריאנטים', 'מספר ספקים', 'טווח סכום', 'סוג זכאי (ראשון)'];
    const maktRows = params.groups.map((g) => {
      const variants = g.variants || [];
      return [
        g.catalogNumber,
        g.description || variants[0]?.description || '',
        g.variant_count || variants.length,
        g.supplier_count || 0,
        this.amountRange(variants),
        variants[0]?.entitledTypeRaw || '',
      ];
    });
    this.writeTable(wsMakt, maktHeaders, maktRows);

    const wsVar = wb.addWorksheet('וריאנטים');
    this.writeTable(
      wsVar,
      VARIANT_COLUMNS.map(([, h]) => h),
      params.items.map((it) => VARIANT_COLUMNS.map(([k]) => it[k])),
    );

    return this.toBuffer(wb);
  }

  /** ייצוא מק"ט + ספקים מורשים. */
  async buildMaktExport(params: {
    makt: string;
    variants: Array<Record<string, any>>;
    suppliers: Array<Record<string, any>>;
    selectedEntityId?: string | null;
    selectedVariant?: Record<string, any> | null;
  }): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const meta = wb.addWorksheet('מידע');
    const desc = params.variants[0]?.description || '';
    const metaRows: Array<[string, unknown]> = [
      ['סוג ייצוא', 'מק״ט + ספקים מורשים'],
      ['תאריך ייצוא', this.nowHe()],
      ['מק"ט', params.makt],
      ['תיאור פריט', desc],
      ['הערה', 'ספקים מורשים ברמת מק״ט — זהים לכל הוריאנטים'],
      ['מספר וריאנטים', params.variants.length],
      ['מספר ספקים', params.suppliers.length],
    ];
    if (params.selectedEntityId) metaRows.push(['וריאנט נבחר', params.selectedEntityId]);
    this.writeMeta(meta, metaRows);

    const wsVar = wb.addWorksheet('וריאנטים');
    this.writeTable(
      wsVar,
      VARIANT_COLUMNS.map(([, h]) => h),
      params.variants.map((v) => VARIANT_COLUMNS.map(([k]) => v[k])),
    );

    const wsSup = wb.addWorksheet('ספקים');
    const supHeaders = ['מספר ספק', 'שם ספק', 'יישוב', 'טלפון', 'מחוז', 'בתוקף'];
    const supRows = params.suppliers.map((s) => [
      s.modSupplierId,
      s.name,
      s.city,
      this.supplierPhone(s),
      s.district,
      s.isActiveAgreement === false ? 'לא' : 'כן',
    ]);
    this.writeTable(wsSup, supHeaders, supRows);

    return this.toBuffer(wb);
  }

  /** ייצוא תוצאות חיפוש חכם (כולל קרבה גיאוגרפית). */
  async buildAiSearchExport(payload: Record<string, any>): Promise<Buffer> {
    const results: Array<Record<string, any>> = payload.results || [];
    const wb = new ExcelJS.Workbook();
    const meta = wb.addWorksheet('מידע');
    this.writeMeta(meta, [
      ['סוג ייצוא', 'חיפוש חכם'],
      ['תאריך ייצוא', this.nowHe()],
      ['שאילתה', payload.query || ''],
      ['מנוע', payload.engine || 'local'],
      ['מיקום משתמש', payload.user_location || '—'],
      ['הסבר', payload.parsed?.explanation || ''],
      ['מספר מקטים', results.length],
    ]);

    const wsMakt = wb.addWorksheet('מקטים');
    const maktHeaders = ['מק"ט', 'תיאור פריט', 'מספר וריאנטים', 'מספר ספקים', 'ספק הכי קרוב', 'יישוב ספק קרוב', 'טווח סכום'];
    const allVariants: unknown[][] = [];
    const allSuppliers: unknown[][] = [];
    const maktRows = results.map((r) => {
      const variants = r.variants || [];
      const suppliers = r.suppliers || [];
      const nearest = r.nearest_supplier || suppliers.find((s: any) => s.is_nearest) || {};
      for (const v of variants) allVariants.push([r.catalogNumber, ...VARIANT_COLUMNS.map(([k]) => v[k])]);
      for (const s of suppliers) {
        allSuppliers.push([
          r.catalogNumber,
          s.is_nearest ? 'הכי קרוב' : s.proximity_label || '',
          s.name,
          s.city,
          this.supplierPhone(s),
          s.district,
          s.isActiveAgreement === false ? 'לא' : 'כן',
        ]);
      }
      return [
        r.catalogNumber,
        r.description || '',
        r.variant_count || variants.length,
        r.supplier_count || suppliers.length,
        nearest.name || '',
        nearest.city || '',
        this.amountRange(variants),
      ];
    });
    this.writeTable(wsMakt, maktHeaders, maktRows);

    const wsVar = wb.addWorksheet('וריאנטים');
    this.writeTable(wsVar, ['מק"ט', ...VARIANT_COLUMNS.map(([, h]) => h)], allVariants);

    const wsSup = wb.addWorksheet('ספקים');
    this.writeTable(wsSup, ['מק"ט', 'קרבה', 'שם ספק', 'יישוב', 'טלפון', 'מחוז', 'בתוקף'], allSuppliers);

    return this.toBuffer(wb);
  }
}
