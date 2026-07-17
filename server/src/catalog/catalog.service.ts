import { Injectable } from '@nestjs/common';
import { CatalogItem } from '@prisma/client';
import { CatalogRepository } from './catalog.repository';
import { parseField, parseMatchMode } from './catalog.types';
import { normalizeCatalogNumber } from '../common/entity-id';

export const REFUND_NOTE = 'יש לבדוק את תאריך ביצוע השירות בהתאם להנחיות ההחזר.';

export interface ItemView extends CatalogItem {
  history_count?: number;
  supplier_count?: number;
}

export interface MaktGroup {
  catalogNumber: string;
  description: string | null;
  variant_count: number;
  supplier_count: number;
  variants: ItemView[];
}

@Injectable()
export class CatalogService {
  constructor(private readonly repo: CatalogRepository) {}

  /** חיפוש פריטים + העשרה בספירת היסטוריה, עם קיבוץ אופציונלי לפי מק"ט. */
  async search(params: {
    q: string;
    match: string;
    field: string;
    limit: number;
    grouped: boolean;
  }) {
    const mode = parseMatchMode(params.match);
    const dbField = parseField(params.field);

    const items: ItemView[] =
      dbField === 'supplier'
        ? await this.repo.searchBySupplier(mode, params.q, params.limit)
        : await this.repo.searchByField(dbField, mode, params.q, params.limit);

    await this.enrichHistoryCounts(items);

    const payload: Record<string, unknown> = {
      query: params.q,
      match: mode,
      field: params.field,
      count: items.length,
      items,
    };

    if (params.grouped) {
      const groups = await this.groupByMakt(items);
      payload.group_count = groups.length;
      payload.groups = groups;
    }
    return payload;
  }

  private async enrichHistoryCounts(items: ItemView[]): Promise<void> {
    const counts = await this.repo.historyCounts(items.map((i) => i.entityId));
    for (const item of items) item.history_count = counts[item.entityId] ?? 0;
  }

  /** קיבוץ וריאנטים לפי מק"ט + ספירת ספקים. */
  async groupByMakt(items: ItemView[]): Promise<MaktGroup[]> {
    const groups: Record<string, MaktGroup> = {};
    const order: string[] = [];
    for (const item of items) {
      const makt = String(item.catalogNumber ?? '');
      if (!groups[makt]) {
        groups[makt] = {
          catalogNumber: makt,
          description: item.description,
          variant_count: 0,
          supplier_count: 0,
          variants: [],
        };
        order.push(makt);
      }
      groups[makt].variants.push(item);
      groups[makt].variant_count += 1;
    }
    const ordered = order.map((m) => groups[m]);
    const counts = await this.repo.supplierCountsForMakts(order);
    for (const g of ordered) {
      const c = counts[g.catalogNumber] ?? 0;
      g.supplier_count = c;
      for (const v of g.variants) v.supplier_count = c;
    }
    return ordered;
  }

  /** פרטי וריאנט מלאים לפי entity_id (כולל ספקים מורשים והיסטוריה). */
  async getItem(entityId: string, historyLimit = 20) {
    const item = await this.repo.findByEntityId(entityId);
    if (!item) return null;
    const suppliers = await this.getSuppliersForMakt(item.catalogNumber);
    const history = historyLimit > 0 ? await this.repo.itemHistory(entityId, historyLimit) : [];
    const historyCounts = await this.repo.historyCounts([entityId]);
    const special_note =
      item.amountTypeRaw && item.amountTypeRaw.includes('החזר') ? REFUND_NOTE : undefined;
    return {
      ...item,
      authorized_suppliers: suppliers,
      change_history: history,
      history_count: historyCounts[entityId] ?? 0,
      ...(special_note ? { special_note } : {}),
    };
  }

  async getItemHistory(entityId: string, limit: number) {
    const exists = await this.repo.findByEntityId(entityId);
    if (!exists) return null;
    const history = await this.repo.itemHistory(entityId, limit);
    return { entityId, count: history.length, history };
  }

  async getItemsForMakt(makt: string) {
    return this.repo.findByCatalogNumber(makt);
  }

  async getSuppliersForMakt(makt: string) {
    return this.repo.suppliersForMakt(makt);
  }

  /** מרכזים רפואיים/ספקים שנותנים שירות למק"ט, מועשרים מספריית myshikum. */
  async getInstitutionsForMakt(makt: string) {
    return this.repo.institutionsForMakt(makt);
  }

  /** חיפוש עמיד-לשגיאות לפי דמיון טריגרמים (pg_trgm) — fallback לחיפוש החכם. */
  async searchByTrigram(query: string, limit: number) {
    return this.repo.searchByTrigram(query, limit);
  }

  /** הכיוון ההפוך: קוד הפניה מב"ר -> רשימת מק"טים (קוד אחד עשוי לכסות כמה מק"טים). */
  async getMaktsForMabar(
    code: string,
  ): Promise<{ mabarCode: string; count: number; catalogNumbers: string[] }> {
    const catalogNumbers = await this.repo.maktsForMabar(code);
    return { mabarCode: (code || '').trim(), count: catalogNumbers.length, catalogNumbers };
  }

  /**
   * מחזיר את קוד השירות (catalogPricelistNum) של המק"ט — הערך הראשון הקיים
   * מבין הוריאנטים. אם למק"ט אין קוד שירות כלל (או שאינו קיים) — serviceCode יהיה null.
   */
  async getServiceCodeForMakt(
    makt: string,
  ): Promise<{ catalogNumber: string; serviceCode: string | null }> {
    const items = await this.repo.findByCatalogNumber(makt);
    const withCode = items.find((i) => i.catalogPricelistNum && i.catalogPricelistNum.trim());
    return {
      catalogNumber: normalizeCatalogNumber(makt),
      serviceCode: withCode?.catalogPricelistNum?.trim() ?? null,
    };
  }
}
