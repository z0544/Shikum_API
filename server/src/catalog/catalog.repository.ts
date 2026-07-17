import { Injectable } from '@nestjs/common';
import { Prisma, CatalogItem } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MatchMode, stringFilter } from './catalog.types';
import { normalizeCatalogNumber, normalizeSupplierId } from '../common/entity-id';

/** שכבת גישה לנתונים (Data Access Layer) לפריטים, הסכמים וספקים. */
@Injectable()
export class CatalogRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** מזהי ספקים פעילים (cache קטן — ~500 ספקים). */
  private validSupplierIds: Set<string> | null = null;

  async getValidSupplierIds(): Promise<Set<string>> {
    if (this.validSupplierIds) return this.validSupplierIds;
    const rows = await this.prisma.supplier.findMany({
      where: { isDeleted: false },
      select: { modSupplierId: true },
    });
    this.validSupplierIds = new Set(rows.map((r) => r.modSupplierId));
    return this.validSupplierIds;
  }

  invalidateSupplierCache(): void {
    this.validSupplierIds = null;
  }

  /** חיפוש פריטים לפי שדה DB יחיד או 'all'. */
  async searchByField(
    dbField: string,
    mode: MatchMode,
    value: string,
    limit: number,
  ): Promise<CatalogItem[]> {
    const filter = stringFilter(mode, value);
    let where: Prisma.CatalogItemWhereInput;
    if (dbField === 'all') {
      where = {
        isDeleted: false,
        OR: [
          { entityId: filter },
          { catalogNumber: filter },
          { description: filter },
          { entitledTypeRaw: filter },
          { catalogPricelistNum: filter },
        ],
      };
    } else {
      where = { isDeleted: false, [dbField]: filter };
    }
    return this.prisma.catalogItem.findMany({ where, take: limit });
  }

  /** חיפוש פריטים לפי שם ספק (דרך הסכמים). */
  async searchBySupplier(mode: MatchMode, value: string, limit: number): Promise<CatalogItem[]> {
    const suppliers = await this.prisma.supplier.findMany({
      where: { isDeleted: false, name: stringFilter(mode, value) },
      select: { modSupplierId: true },
    });
    if (!suppliers.length) return [];
    const supplierIds = suppliers.map((s) => s.modSupplierId);
    const agreements = await this.prisma.agreement.findMany({
      where: { modSupplierId: { in: supplierIds } },
      select: { catalogNumber: true },
      distinct: ['catalogNumber'],
    });
    const makts = [...new Set(agreements.map((a) => a.catalogNumber))];
    if (!makts.length) return [];
    return this.prisma.catalogItem.findMany({
      where: { isDeleted: false, catalogNumber: { in: makts } },
      take: limit,
    });
  }

  async findByEntityId(entityId: string): Promise<CatalogItem | null> {
    return this.prisma.catalogItem.findFirst({ where: { entityId, isDeleted: false } });
  }

  async findByCatalogNumber(catalogNumber: string): Promise<CatalogItem[]> {
    return this.prisma.catalogItem.findMany({
      where: { catalogNumber: normalizeCatalogNumber(catalogNumber), isDeleted: false },
      orderBy: { entityId: 'asc' },
    });
  }

  /**
   * חיפוש עמיד-לשגיאות לפי דמיון טריגרמים (pg_trgm) על התיאור — מדורג לפי דמיון.
   * מחזיר [] אם ההרחבה אינה זמינה, כדי שהקורא ייפול לחיפוש רגיל.
   */
  async searchByTrigram(query: string, limit: number): Promise<CatalogItem[]> {
    const q = (query || '').trim();
    if (q.length < 2) return [];
    try {
      const rows = await this.prisma.$queryRaw<{ id: number }[]>`
        SELECT id FROM catalog_items
        WHERE is_deleted = false AND description % ${q}
        ORDER BY similarity(description, ${q}) DESC
        LIMIT ${limit}
      `;
      const ids = rows.map((r) => Number(r.id));
      if (!ids.length) return [];
      const items = await this.prisma.catalogItem.findMany({ where: { id: { in: ids } } });
      const order = new Map(ids.map((id, i) => [id, i]));
      return items.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    } catch {
      return [];
    }
  }

  /** מפת מק"ט -> מספר ספקים ייחודיים (הסכם פעיל + ספק קיים). */
  async supplierCountsForMakts(makts: string[]): Promise<Record<string, number>> {
    const unique = [...new Set(makts.map((m) => normalizeCatalogNumber(m)).filter(Boolean))];
    if (!unique.length) return {};
    const valid = await this.getValidSupplierIds();
    const agreements = await this.prisma.agreement.findMany({
      where: { catalogNumber: { in: unique }, isDeleted: false },
      select: { catalogNumber: true, modSupplierId: true },
    });
    const perMakt: Record<string, Set<string>> = {};
    for (const a of agreements) {
      if (!valid.has(a.modSupplierId)) continue;
      (perMakt[a.catalogNumber] ??= new Set()).add(a.modSupplierId);
    }
    const result: Record<string, number> = {};
    for (const m of unique) result[m] = perMakt[m]?.size ?? 0;
    return result;
  }

  /** ספקים מורשים למק"ט (עם dedup). */
  async suppliersForMakt(makt: string) {
    const m = normalizeCatalogNumber(makt);
    const agreements = await this.prisma.agreement.findMany({
      where: { catalogNumber: m, isDeleted: false },
      select: { modSupplierId: true, isActive: true },
    });
    if (!agreements.length) return [];
    const ids = [...new Set(agreements.map((a) => a.modSupplierId))];
    const activeById = new Map(agreements.map((a) => [a.modSupplierId, a.isActive]));
    const suppliers = await this.prisma.supplier.findMany({
      where: { isDeleted: false, modSupplierId: { in: ids } },
      orderBy: { name: 'asc' },
    });
    return suppliers.map((s) => ({ ...s, isActiveAgreement: activeById.get(s.modSupplierId) ?? true }));
  }

  /**
   * מרכזים רפואיים/ספקים למק"ט — ספקי ההסכם, מועשרים מספריית myshikum
   * (מקצוע, סיווג, גיאו, נגישות). נופל לנתוני Supplier כשאין רשומה בספרייה.
   */
  async institutionsForMakt(makt: string) {
    const suppliers = await this.suppliersForMakt(makt);
    if (!suppliers.length) return [];
    const keys = [
      ...new Set(suppliers.map((s) => normalizeSupplierId(s.rehabSupplierId)).filter(Boolean)),
    ];
    const dir = keys.length
      ? await this.prisma.providerDirectory.findMany({
          where: { isDeleted: false, rehabSupplierId: { in: keys } },
        })
      : [];
    const byKey = new Map(dir.map((d) => [d.rehabSupplierId, d]));
    return suppliers.map((s) => {
      const d = byKey.get(normalizeSupplierId(s.rehabSupplierId));
      return {
        modSupplierId: s.modSupplierId,
        rehabSupplierId: s.rehabSupplierId,
        name: d?.name ?? s.name,
        kind: d?.kind ?? null,
        professions: d?.professions ?? (s.profession ? [s.profession] : []),
        city: d?.city ?? s.city,
        street: d?.street ?? s.street,
        phone: d?.phone ?? s.mobile ?? s.workPhone ?? s.landline ?? null,
        email: d?.email ?? s.email,
        lat: d?.lat ?? null,
        lng: d?.lng ?? null,
        accessible: d?.accessible ?? null,
        homeVisit: d?.homeVisit ?? null,
        isActiveAgreement: s.isActiveAgreement,
        basis: 'mod_agreement',
        source: d ? d.source : 'agreement',
        enriched: Boolean(d),
      };
    });
  }

  /** ספירת רשומות היסטוריה לכל מפתח. */
  async historyCounts(keys: string[]): Promise<Record<string, number>> {
    const unique = [...new Set(keys.filter(Boolean))];
    if (!unique.length) return {};
    const rows = await this.prisma.itemHistory.groupBy({
      by: ['entityKey'],
      where: { entityKey: { in: unique } },
      _count: { _all: true },
    });
    const result: Record<string, number> = {};
    for (const r of rows) result[r.entityKey] = r._count._all;
    return result;
  }

  async itemHistory(entityKey: string, limit: number) {
    return this.prisma.itemHistory.findMany({
      where: { entityKey },
      orderBy: { id: 'desc' },
      take: limit,
      include: { syncRun: { select: { filename: true, fileType: true } } },
    });
  }
}
