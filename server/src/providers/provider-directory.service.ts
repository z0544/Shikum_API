import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeSupplierId } from '../common/entity-id';

/** בסיס ה-API הציבורי של אגף השיקום (ללא אימות). ניתן לעקיפה ב-ENV. */
const API_BASE = process.env.MYSHIKUM_API_BASE || 'https://myshikum.mod.gov.il/api';
const USER_AGENT = 'Shikum_API provider-directory ETL';

/** קטגוריות רפואיות/פרא-רפואיות. lawyers מושמט (אינו רפואי). */
const CATEGORIES: Array<{ category: string; queryName: string; resourceKey: string }> = [
  { category: 'doctors', queryName: 'specialty', resourceKey: 'doctors' },
  { category: 'paramedical', queryName: 'profession', resourceKey: 'paramedical-occupations' },
  { category: 'mental', queryName: 'profession', resourceKey: 'mental' },
  { category: 'medicalService', queryName: 'profession', resourceKey: 'medicalService-occupations' },
  { category: 'imagingInstitutes', queryName: 'specialty', resourceKey: 'imagingInstitutes' },
  { category: 'labTests', queryName: 'specialty', resourceKey: 'labTests-occupations' },
  { category: 'medicalEquipment', queryName: 'profession', resourceKey: 'medicalEquipment-occupations' },
];

interface RawSupplier {
  id: string;
  name?: string;
  professions?: number[];
  firstStreet?: string;
  firstHouseNumber?: string;
  firstCityId?: number;
  firstZipCode?: string;
  email?: string;
  workPhonePrefix?: string;
  workPhoneNumber?: string;
  homePhonePrefix?: string;
  homePhoneNumber?: string;
  cellPhonePrefix?: string;
  cellPhoneNumber?: string;
  hasHomeVisit?: boolean;
  hasAccessibilityForHandicapped?: boolean;
}

/**
 * ETL לספריית הספקים/מרכזים הציבורית של אגף השיקום.
 * מושך את הרשומות ומרענן את טבלת provider_directory (snapshot מלא בטרנזקציה),
 * ורושם SyncRun (fileType: 'providers').
 */
@Injectable()
export class ProviderDirectoryService {
  private readonly logger = new Logger(ProviderDirectoryService.name);

  constructor(private readonly prisma: PrismaService) {}

  private async api<T>(path: string): Promise<T> {
    const res = await fetch(`${API_BASE}/${path}`, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for /${path}`);
    return (await res.json()) as T;
  }

  /** קטגוריות-משנה שאינן מקצוע (לא לערבב במיפוי המקצועות). */
  private static readonly NON_PROFESSION = new Set(['Language', 'Gender', 'Prefix', 'AcademicDegree']);

  private flattenResources(payload: any): Record<number, string> {
    const map: Record<number, string> = {};
    const collect = (arr: any[]) =>
      arr?.forEach((r) => (map[r.resourceId] = String(r.content).trim()));
    if (Array.isArray(payload?.resources)) collect(payload.resources);
    else if (payload && typeof payload === 'object')
      for (const v of Object.values<any>(payload))
        if (Array.isArray(v?.resources) && !ProviderDirectoryService.NON_PROFESSION.has(v?.categoryName))
          collect(v.resources);
    return map;
  }

  private phone(s: RawSupplier): string | null {
    const p = String(s.workPhonePrefix || s.homePhonePrefix || s.cellPhonePrefix || '').trim();
    const n = String(s.workPhoneNumber || s.homePhoneNumber || s.cellPhoneNumber || '').trim();
    return p && n ? `${p}-${n}` : null;
  }

  private classify(name: string): string {
    if (/בית חולים|בי"ח|מרכז רפואי/.test(name)) return 'hospital';
    if (/מכון|עמותה|בע"מ|ע"ר|בית הלוחם|מרכז/.test(name)) return 'institute';
    return 'individual';
  }

  /** מושך את כל הספקים, ממזג לפי modSupplierId מנורמל. */
  private async fetchDirectory(): Promise<Map<string, any>> {
    const citiesRaw = await this.api<Array<{ id: number; value: string }>>('GeneralOptions/Cities');
    const cities = new Map(citiesRaw.map((c) => [c.id, c.value.trim()]));

    const providers = new Map<string, any>();
    for (const cat of CATEGORIES) {
      let occ: Record<number, string> = {};
      try {
        occ = this.flattenResources(await this.api(`SupplierResources/${cat.resourceKey}`));
      } catch {
        /* אופציונלי */
      }
      let list: RawSupplier[] = [];
      try {
        list = await this.api<RawSupplier[]>(`Suppliers/${cat.category}`);
      } catch (e) {
        this.logger.warn(`דילוג ${cat.category}: ${(e as Error).message}`);
      }
      // imaging/lab מחזירים רשימה רק עם specialty — נמשך per-resource.
      if ((!list || list.length === 0) && Object.keys(occ).length) {
        const merged = new Map<string, RawSupplier>();
        for (const rid of Object.keys(occ)) {
          try {
            (await this.api<RawSupplier[]>(`Suppliers/${cat.category}?${cat.queryName}=${rid}`)).forEach(
              (s) => merged.set(s.id, s),
            );
          } catch {
            /* דלג */
          }
        }
        list = [...merged.values()];
      }

      for (const s of list || []) {
        const key = normalizeSupplierId(s.id);
        if (!key) continue;
        const professions = (s.professions || []).map((p) => occ[p]).filter(Boolean);
        const rec =
          providers.get(key) ||
          providers
            .set(key, {
              rehabSupplierId: key,
              rawId: s.id,
              name: String(s.name || '').trim(),
              kind: this.classify(String(s.name || '')),
              categories: [] as string[],
              professions: [] as string[],
              city: cities.get(s.firstCityId as number) || null,
              street: [String(s.firstStreet || '').trim(), String(s.firstHouseNumber || '').trim()]
                .filter(Boolean)
                .join(' ') || null,
              zip: String(s.firstZipCode || '').trim() || null,
              phone: this.phone(s),
              email: s.email || null,
              homeVisit: !!s.hasHomeVisit,
              accessible: !!s.hasAccessibilityForHandicapped,
              source: 'myshikum',
            })
            .get(key);
        if (!rec.categories.includes(cat.category)) rec.categories.push(cat.category);
        for (const pr of professions) if (!rec.professions.includes(pr)) rec.professions.push(pr);
      }
      this.logger.log(`${cat.category}: ${(list || []).length} ספקים`);
    }
    return providers;
  }

  /** מרענן את הספרייה (snapshot מלא) ורושם SyncRun. */
  async sync(): Promise<{ status: string; sync_run_id: number; count: number }> {
    const run = await this.prisma.syncRun.create({
      data: { fileType: 'providers', filename: API_BASE, status: 'running' },
    });
    try {
      const providers = await this.fetchDirectory();
      const rows = [...providers.values()];
      await this.prisma.$transaction(
        async (tx) => {
          await tx.providerDirectory.deleteMany({});
          if (rows.length) await tx.providerDirectory.createMany({ data: rows });
        },
        { timeout: 120000 },
      );
      await this.prisma.syncRun.update({
        where: { id: run.id },
        data: { status: 'completed', finishedAt: new Date(), addedCount: rows.length },
      });
      this.logger.log(`ספריית ספקים רועננה: ${rows.length} רשומות`);
      return { status: 'ok', sync_run_id: run.id, count: rows.length };
    } catch (err) {
      await this.prisma.syncRun.update({
        where: { id: run.id },
        data: { status: 'failed', finishedAt: new Date(), errorMessage: (err as Error).message },
      });
      throw err;
    }
  }
}
