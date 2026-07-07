import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EtlService } from '../etl/etl.service';
import { CatalogRepository } from '../catalog/catalog.repository';
import { FileKind } from '../common/columns';
import { readKmsFile } from '../etl/excel-loader';

export interface FieldChange {
  field: string;
  old: string | null;
  new: string | null;
}
export interface PlanRow {
  key: string;
  label: Record<string, unknown>;
  changes?: FieldChange[];
  restored?: boolean;
}
export interface SyncPlan {
  fileType: FileKind;
  filename: string;
  summary: { new: number; updated: number; deleted: number; unchanged: number };
  new: PlanRow[];
  updated: PlanRow[];
  deleted: PlanRow[];
  unchanged_count: number;
}

/** שדות להשוואה בכל סוג קובץ (ללא מפתחות ומטא-דאטה). */
const COMPARE_FIELDS: Record<FileKind, string[]> = {
  items: [
    'catalogNumber',
    'description',
    'entitlementFrequency',
    'quantityPerPeriod',
    'maxQuantity',
    'entitledTypeRaw',
    'entitledType',
    'amountTypeRaw',
    'amountType',
    'baseLevel',
    'exceptionLevel',
    'exceptionPercent',
    'amount',
  ],
  suppliers: [
    'rehabSupplierId',
    'name',
    'city',
    'street',
    'mobile',
    'workPhone',
    'landline',
    'email',
    'profession',
    'specialization',
    'subSpecialization',
    'therapeuticApproach',
    'validFrom',
    'validTo',
    'district',
  ],
  agreements: ['rehabSupplierId', 'isActive', 'suppliersPerMakt'],
};

/**
 * מנוע סנכרון דלתאות גנרי לשלושת הקבצים.
 * מזהה: חדש (Insert) · עודכן (Update, עם diff לכל שדה) · הוסר (Soft-Delete).
 * מקביל ל-items_sync.py, מוכלל לכל סוגי הישויות.
 */
@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly etl: EtlService,
    private readonly catalogRepo: CatalogRepository,
  ) {}

  private cmp(v: unknown): string {
    if (v === null || v === undefined) return '';
    if (typeof v === 'boolean') return v ? '1' : '0';
    const s = String(v).trim();
    if (['nan', 'none', '<na>'].includes(s.toLowerCase())) return '';
    return s;
  }

  /** מפתח ראשי לכל סוג ישות. */
  private keyOf(kind: FileKind, row: Record<string, any>): string {
    if (kind === 'items') return String(row.entityId);
    if (kind === 'suppliers') return String(row.modSupplierId);
    return `${row.modSupplierId}|${row.catalogNumber}`;
  }

  private label(kind: FileKind, row: Record<string, any>): Record<string, unknown> {
    if (kind === 'items') return { entityId: row.entityId, catalogNumber: row.catalogNumber, description: row.description };
    if (kind === 'suppliers') return { modSupplierId: row.modSupplierId, name: row.name, city: row.city };
    return { modSupplierId: row.modSupplierId, catalogNumber: row.catalogNumber };
  }

  /** בונה מפת key -> שורת DB מהקובץ החדש (כולל dedup). */
  private async buildKeyedRows(kind: FileKind, buffer: Buffer): Promise<Map<string, Record<string, any>>> {
    const records = readKmsFile(buffer, kind);
    if (!records.length) throw new Error('הקובץ ריק או שלא זוהתה שורת כותרת מתאימה');

    const map = new Map<string, Record<string, any>>();
    if (kind === 'items') {
      const rows: Awaited<ReturnType<EtlService['buildItemRow']>>[] = [];
      for (const rec of records) rows.push(await this.etl.buildItemRow(rec));
      for (const row of this.etl.dedupeItems(rows)) map.set(this.keyOf(kind, row), row);
    } else if (kind === 'suppliers') {
      for (const rec of records) {
        const row = this.etl.buildSupplierRow(rec);
        const k = this.keyOf(kind, row);
        if (!map.has(k)) map.set(k, row);
      }
    } else {
      for (const rec of records) {
        const row = this.etl.buildAgreementRow(rec);
        const k = this.keyOf(kind, row);
        if (!map.has(k)) map.set(k, row);
      }
    }
    return map;
  }

  private async loadExisting(kind: FileKind): Promise<Map<string, Record<string, any>>> {
    const map = new Map<string, Record<string, any>>();
    if (kind === 'items') {
      const rows = await this.prisma.catalogItem.findMany();
      for (const r of rows) map.set(String(r.entityId), r as any);
    } else if (kind === 'suppliers') {
      const rows = await this.prisma.supplier.findMany();
      for (const r of rows) map.set(String(r.modSupplierId), r as any);
    } else {
      const rows = await this.prisma.agreement.findMany();
      for (const r of rows) map.set(`${r.modSupplierId}|${r.catalogNumber}`, r as any);
    }
    return map;
  }

  private diff(kind: FileKind, oldRow: Record<string, any>, newRow: Record<string, any>): FieldChange[] {
    const changes: FieldChange[] = [];
    for (const f of COMPARE_FIELDS[kind]) {
      const ov = this.cmp(oldRow[f]);
      const nv = this.cmp(newRow[f]);
      if (ov !== nv) changes.push({ field: f, old: ov || null, new: nv || null });
    }
    return changes;
  }

  /** מחשב תוכנית סנכרון ללא שינוי ב-DB (preview). */
  async computePlan(kind: FileKind, buffer: Buffer, filename: string): Promise<SyncPlan> {
    const newRows = await this.buildKeyedRows(kind, buffer);
    const existing = await this.loadExisting(kind);

    const plan: SyncPlan = {
      fileType: kind,
      filename,
      summary: { new: 0, updated: 0, deleted: 0, unchanged: 0 },
      new: [],
      updated: [],
      deleted: [],
      unchanged_count: 0,
    };

    for (const [key, newRow] of newRows) {
      const oldRow = existing.get(key);
      if (!oldRow) {
        plan.new.push({ key, label: this.label(kind, newRow) });
        continue;
      }
      const wasDeleted = Boolean(oldRow.isDeleted);
      const changes = this.diff(kind, oldRow, newRow);
      if (wasDeleted || changes.length) {
        plan.updated.push({ key, label: this.label(kind, newRow), changes, ...(wasDeleted ? { restored: true } : {}) });
      } else {
        plan.unchanged_count += 1;
      }
    }

    for (const [key, oldRow] of existing) {
      if (newRows.has(key) || oldRow.isDeleted) continue;
      plan.deleted.push({ key, label: this.label(kind, oldRow) });
    }

    plan.summary = {
      new: plan.new.length,
      updated: plan.updated.length,
      deleted: plan.deleted.length,
      unchanged: plan.unchanged_count,
    };
    return plan;
  }

  // --- פעולות DB ספציפיות לכל סוג ---
  private buildDataForUpdate(kind: FileKind, newRow: Record<string, any>): Record<string, any> {
    const data: Record<string, any> = {};
    for (const f of COMPARE_FIELDS[kind]) data[f] = newRow[f] ?? null;
    return data;
  }

  private async createRow(tx: any, kind: FileKind, row: Record<string, any>) {
    if (kind === 'items') return tx.catalogItem.create({ data: { ...row, isDeleted: false } });
    if (kind === 'suppliers') return tx.supplier.create({ data: { ...row, isDeleted: false } });
    return tx.agreement.create({ data: { ...row, isDeleted: false } });
  }

  private async updateRow(tx: any, kind: FileKind, key: string, data: Record<string, any>) {
    if (kind === 'items') return tx.catalogItem.update({ where: { entityId: key }, data });
    if (kind === 'suppliers') return tx.supplier.update({ where: { modSupplierId: key }, data });
    const [modSupplierId, catalogNumber] = key.split('|');
    return tx.agreement.update({ where: { supplier_makt: { modSupplierId, catalogNumber } }, data });
  }

  private async setDeleted(tx: any, kind: FileKind, key: string, isDeleted: boolean) {
    const data = { isDeleted };
    if (kind === 'items') return tx.catalogItem.update({ where: { entityId: key }, data });
    if (kind === 'suppliers') return tx.supplier.update({ where: { modSupplierId: key }, data });
    const [modSupplierId, catalogNumber] = key.split('|');
    return tx.agreement.update({ where: { supplier_makt: { modSupplierId, catalogNumber } }, data });
  }

  /** מיישם את תוכנית הסנכרון (apply) בטרנזקציה + רישום היסטוריה ו-SyncRun. */
  async apply(kind: FileKind, buffer: Buffer, filename: string) {
    const plan = await this.computePlan(kind, buffer, filename);
    const newRows = await this.buildKeyedRows(kind, buffer);
    const existing = await this.loadExisting(kind);

    const run = await this.prisma.syncRun.create({
      data: { fileType: kind, filename, status: 'running' },
    });

    let added = 0;
    let updated = 0;
    let deleted = 0;
    let unchanged = 0;

    try {
      await this.prisma.$transaction(
        async (tx) => {
          const hist: any[] = [];

          for (const [key, newRow] of newRows) {
            const oldRow = existing.get(key);
            if (!oldRow) {
              await this.createRow(tx, kind, newRow);
              hist.push({ entityKey: key, fileType: kind, syncRunId: run.id, action: 'created' });
              added += 1;
              continue;
            }
            const wasDeleted = Boolean(oldRow.isDeleted);
            const changes = this.diff(kind, oldRow, newRow);
            if (!wasDeleted && !changes.length) {
              unchanged += 1;
              continue;
            }
            if (wasDeleted) {
              hist.push({
                entityKey: key,
                fileType: kind,
                syncRunId: run.id,
                action: 'restored',
                fieldName: 'isDeleted',
                oldValue: '1',
                newValue: '0',
              });
            }
            await this.updateRow(tx, kind, key, { ...this.buildDataForUpdate(kind, newRow), isDeleted: false });
            for (const ch of changes) {
              hist.push({
                entityKey: key,
                fileType: kind,
                syncRunId: run.id,
                action: 'updated',
                fieldName: ch.field,
                oldValue: ch.old,
                newValue: ch.new,
              });
            }
            updated += 1;
          }

          for (const [key, oldRow] of existing) {
            if (newRows.has(key) || oldRow.isDeleted) continue;
            await this.setDeleted(tx, kind, key, true);
            hist.push({
              entityKey: key,
              fileType: kind,
              syncRunId: run.id,
              action: 'deleted',
              fieldName: 'isDeleted',
              oldValue: '0',
              newValue: '1',
            });
            deleted += 1;
          }

          if (hist.length) await tx.itemHistory.createMany({ data: hist });
        },
        { timeout: 120000 },
      );

      await this.prisma.syncRun.update({
        where: { id: run.id },
        data: {
          status: 'completed',
          finishedAt: new Date(),
          addedCount: added,
          updatedCount: updated,
          deletedCount: deleted,
          unchangedCount: unchanged,
        },
      });
      this.catalogRepo.invalidateSupplierCache();
    } catch (err) {
      await this.prisma.syncRun.update({
        where: { id: run.id },
        data: { status: 'failed', finishedAt: new Date(), errorMessage: (err as Error).message },
      });
      throw err;
    }

    return {
      status: 'ok',
      sync_run_id: run.id,
      summary: { new: added, updated, deleted, unchanged },
      plan: plan.summary,
    };
  }

  async listSyncRuns(limit = 50) {
    return this.prisma.syncRun.findMany({ orderBy: { id: 'desc' }, take: limit });
  }
}
