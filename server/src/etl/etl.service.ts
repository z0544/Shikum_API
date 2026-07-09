import * as fs from 'fs';
import * as XLSX from 'xlsx';
import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CONFIG_FIELDS, ConfigMapService } from '../config-map/config-map.service';
import { GeoService } from '../geo/geo.service';
import { buildEntityId, normalizeCatalogNumber, normalizeIntPart } from '../common/entity-id';
import { dataFile } from '../common/paths';
import { readKmsFile, RawRecord } from './excel-loader';

export interface EtlStats {
  items: number;
  suppliers: number;
  agreements: number;
}

const CHUNK = 500;

/** ETL: טעינת 3 קובצי ה-XLSX, בניית Variant ID, העשרת מחוז, וכתיבה ל-DB. */
@Injectable()
export class EtlService {
  private readonly logger = new Logger(EtlService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigMapService,
    private readonly geo: GeoService,
  ) {}

  private toLevelInt(v: unknown): number {
    return parseInt(normalizeIntPart(v), 10) || 0;
  }

  /**
   * טוען מיפוי מק"ט -> Catalog_PricelistNum מקובץ קטלוג השיקום (CSV).
   * מדלג על ערכים ריקים/NULL. הקובץ אופציונלי — אם חסר, מוחזר מיפוי ריק.
   */
  loadPricelistMap(): Map<string, string> {
    const map = new Map<string, string>();
    const path = dataFile(process.env.CATALOG_PRICELIST_FILE || 'shikum catalog.csv');
    if (!fs.existsSync(path)) {
      this.logger.warn(`קובץ קטלוג המחירון לא נמצא (${path}) — דילוג על Catalog_PricelistNum`);
      return map;
    }
    const wb = XLSX.readFile(path, { raw: false });
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], {
      defval: null,
      raw: false,
    });
    for (const r of rows) {
      const cn = normalizeCatalogNumber(r['ShikumCatalog_CatalogNumber']);
      const raw = r['Catalog_PricelistNum'];
      const val = raw === null || raw === undefined ? '' : String(raw).trim();
      if (!val || val.toUpperCase() === 'NULL') continue;
      if (cn && cn !== '0') map.set(cn, val);
    }
    this.logger.log(`Catalog_PricelistNum: ${map.size} מק"טים נטענו מהקטלוג`);
    return map;
  }

  /** ממיר רשומת פריט גולמית לשורת DB (כולל Variant ID מספרי). */
  async buildItemRow(rec: RawRecord): Promise<Prisma.CatalogItemCreateManyInput> {
    const entitledType = await this.config.toInt(CONFIG_FIELDS.ENTITLED_TYPE, rec['entitledTypeRaw']);
    const amountType = await this.config.toInt(CONFIG_FIELDS.AMOUNT_TYPE, rec['amountTypeRaw']);
    const baseLevel = this.toLevelInt(rec['baseLevel']);
    const exceptionLevel = this.toLevelInt(rec['exceptionLevel']);
    // מק"ט קנוני (ללא אפסים מובילים) — כדי שיתלכד עם קובץ ההסכמים
    const catalogNumber = normalizeCatalogNumber(rec['catalogNumber']);

    const entityId = buildEntityId({
      catalogNumber,
      entitledType,
      amountType,
      baseLevel,
      exceptionLevel,
    });

    return {
      entityId,
      catalogNumber,
      description: rec['description'],
      entitlementFrequency: rec['entitlementFrequency'],
      quantityPerPeriod: rec['quantityPerPeriod'],
      maxQuantity: rec['maxQuantity'],
      entitledTypeRaw: rec['entitledTypeRaw'],
      entitledType,
      amountTypeRaw: rec['amountTypeRaw'],
      amountType,
      baseLevel,
      exceptionLevel,
      exceptionPercent: rec['exceptionPercent'],
      amount: rec['amount'],
    };
  }

  /** מסיר כפילויות פריטים לפי entityId — שומר את בעל הסכום הגבוה ביותר (כמו במקור). */
  dedupeItems(rows: Prisma.CatalogItemCreateManyInput[]): Prisma.CatalogItemCreateManyInput[] {
    const byId = new Map<string, Prisma.CatalogItemCreateManyInput>();
    for (const row of rows) {
      const existing = byId.get(row.entityId);
      if (!existing) {
        byId.set(row.entityId, row);
        continue;
      }
      const a = Number(String(row.amount ?? '').replace(/,/g, ''));
      const b = Number(String(existing.amount ?? '').replace(/,/g, ''));
      if ((Number.isFinite(a) ? a : -Infinity) > (Number.isFinite(b) ? b : -Infinity)) {
        byId.set(row.entityId, row);
      }
    }
    return [...byId.values()];
  }

  buildSupplierRow(rec: RawRecord): Prisma.SupplierCreateManyInput {
    const city = rec['city'];
    const district = this.geo.getDistrict(city) ?? null;
    return {
      modSupplierId: String(rec['modSupplierId']).trim(),
      rehabSupplierId: rec['rehabSupplierId'],
      name: rec['name'],
      city,
      street: rec['street'],
      mobile: rec['mobile'],
      workPhone: rec['workPhone'],
      landline: rec['landline'],
      email: rec['email'],
      profession: rec['profession'],
      specialization: rec['specialization'],
      subSpecialization: rec['subSpecialization'],
      therapeuticApproach: rec['therapeuticApproach'],
      validFrom: rec['validFrom'],
      validTo: rec['validTo'],
      district,
    };
  }

  buildAgreementRow(rec: RawRecord): Prisma.AgreementCreateManyInput {
    return {
      modSupplierId: String(rec['modSupplierId']).trim(),
      rehabSupplierId: rec['rehabSupplierId'],
      // מק"ט קנוני (ללא אפסים מובילים) — מפתח החיבור לפריטים
      catalogNumber: normalizeCatalogNumber(rec['catalogNumber']),
      isActive: String(rec['isActiveRaw'] ?? '').trim() === 'כן',
      suppliersPerMakt: rec['suppliersPerMakt'],
    };
  }

  private dedupeBy<T>(rows: T[], keyFn: (r: T) => string): T[] {
    const map = new Map<string, T>();
    for (const r of rows) {
      const k = keyFn(r);
      if (!map.has(k)) map.set(k, r);
    }
    return [...map.values()];
  }

  private async insertChunked<T>(
    label: string,
    rows: T[],
    insert: (chunk: T[]) => Promise<unknown>,
  ): Promise<void> {
    for (let i = 0; i < rows.length; i += CHUNK) {
      await insert(rows.slice(i, i + CHUNK));
    }
    this.logger.log(`${label}: ${rows.length} שורות נטענו`);
  }

  /** טעינה מלאה מאפס (מוחק וטוען מחדש את כל הטבלאות). */
  async processData(): Promise<EtlStats> {
    const itemsPath = dataFile(process.env.ITEMS_FILE || 'items_53331.xlsx');
    const suppliersPath = dataFile(process.env.SUPPLIERS_FILE || 'suppliers_9028.xlsx');
    const agreementsPath = dataFile(process.env.AGREEMENTS_FILE || 'agreements_52593.xlsx');

    this.logger.log('קורא קבצים...');
    const itemRecs = readKmsFile(itemsPath, 'items');
    const supplierRecs = readKmsFile(suppliersPath, 'suppliers');
    const agreementRecs = readKmsFile(agreementsPath, 'agreements');

    await this.config.seedDefaults();

    // מיפוי מק"ט -> Catalog_PricelistNum מקובץ קטלוג השיקום
    const pricelist = this.loadPricelistMap();

    // פריטים — בניית Variant ID + dedup + העשרת מספר מחירון
    const itemRows: Prisma.CatalogItemCreateManyInput[] = [];
    for (const rec of itemRecs) {
      const row = await this.buildItemRow(rec);
      const pl = pricelist.get(String(row.catalogNumber));
      if (pl) row.catalogPricelistNum = pl;
      itemRows.push(row);
    }
    const dedupedItems = this.dedupeItems(itemRows);

    const supplierRows = this.dedupeBy(
      supplierRecs.map((r) => this.buildSupplierRow(r)),
      (r) => r.modSupplierId,
    );
    const agreementRows = this.dedupeBy(
      agreementRecs.map((r) => this.buildAgreementRow(r)),
      (r) => `${r.modSupplierId}|${r.catalogNumber}`,
    );

    // כתיבה — ניקוי וטעינה מחדש
    this.logger.log('מנקה טבלאות קיימות...');
    await this.prisma.itemHistory.deleteMany();
    await this.prisma.catalogItem.deleteMany();
    await this.prisma.supplier.deleteMany();
    await this.prisma.agreement.deleteMany();

    await this.insertChunked('items', dedupedItems, (chunk) =>
      this.prisma.catalogItem.createMany({ data: chunk }),
    );
    await this.insertChunked('suppliers', supplierRows, (chunk) =>
      this.prisma.supplier.createMany({ data: chunk }),
    );
    await this.insertChunked('agreements', agreementRows, (chunk) =>
      this.prisma.agreement.createMany({ data: chunk }),
    );

    return {
      items: dedupedItems.length,
      suppliers: supplierRows.length,
      agreements: agreementRows.length,
    };
  }
}
