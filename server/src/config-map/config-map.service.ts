import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** שמות השדות במילון הקונפיגורציה. */
export const CONFIG_FIELDS = {
  ENTITLED_TYPE: 'entitledType',
  AMOUNT_TYPE: 'amountType',
} as const;

/** מיפויי חובה לפי ההוראות (§4). ערכים נוספים נרשמים אוטומטית. */
const SEED: Array<{ field: string; textValue: string; intValue: number }> = [
  { field: CONFIG_FIELDS.ENTITLED_TYPE, textValue: 'נכים', intValue: 1 },
  { field: CONFIG_FIELDS.ENTITLED_TYPE, textValue: 'יתומים', intValue: 2 },
  { field: CONFIG_FIELDS.ENTITLED_TYPE, textValue: 'אחר', intValue: 3 },
  { field: CONFIG_FIELDS.AMOUNT_TYPE, textValue: 'הלוואה', intValue: 1 },
  { field: CONFIG_FIELDS.AMOUNT_TYPE, textValue: 'סכום', intValue: 2 },
];

/** ערכים המתנרמלים ל"ריק" — ללא מיפוי, קוד 0. */
const EMPTY_SENTINELS = ['nan', 'none', '<na>'];

/** עמודת ה-raw בטבלת הפריטים המשקפת כל שדה קונפיגורציה — לבדיקת שימוש לפני עריכה. */
const RAW_COLUMN_BY_FIELD: Record<string, 'entitledTypeRaw' | 'amountTypeRaw'> = {
  [CONFIG_FIELDS.ENTITLED_TYPE]: 'entitledTypeRaw',
  [CONFIG_FIELDS.AMOUNT_TYPE]: 'amountTypeRaw',
};

/**
 * ממיר טקסט קונפיגורציה לקוד INT יציב. ConfigMapService הוא ה-resolver המתמיד (ערך לא מוכר
 * נרשם); previewResolver() מחזיר resolver שאינו מתמיד, לתכנון קריאה-בלבד (preview).
 */
export interface ConfigResolver {
  toInt(field: string, rawText: unknown): Promise<number>;
}

/**
 * מנוע הקונפיגורציה: ממיר טקסט מה-XLSX לערך INT דרך מילון הניתן לעריכה.
 * ערך שאינו קיים נרשם אוטומטית עם ה-INT הפנוי הבא (כדי לשמור על ID מספרי ויציב).
 * ערך ריק -> 0 (ברירת מחדל).
 */
@Injectable()
export class ConfigMapService implements ConfigResolver {
  private readonly logger = new Logger(ConfigMapService.name);
  // cache: field -> (normalizedText -> int)
  private cache = new Map<string, Map<string, number>>();
  private maxInt = new Map<string, number>();
  private loaded = false;

  constructor(private readonly prisma: PrismaService) {}

  private norm(text: unknown): string {
    return String(text ?? '').trim();
  }

  /** זורע את מיפויי החובה אם חסרים. נקרא לפני ETL. */
  async seedDefaults(): Promise<void> {
    for (const row of SEED) {
      await this.prisma.configMap.upsert({
        where: { field_text: { field: row.field, textValue: row.textValue } },
        update: {},
        create: row,
      });
    }
    this.loaded = false; // אילוץ טעינה מחדש
    await this.load();
  }

  /** טוען את כל המילון לזיכרון (cache) לביצועים בזמן ETL. */
  async load(): Promise<void> {
    const rows = await this.prisma.configMap.findMany();
    this.cache = new Map();
    this.maxInt = new Map();
    for (const r of rows) {
      if (!this.cache.has(r.field)) this.cache.set(r.field, new Map());
      this.cache.get(r.field)!.set(this.norm(r.textValue), r.intValue);
      this.maxInt.set(r.field, Math.max(this.maxInt.get(r.field) ?? 0, r.intValue));
    }
    this.loaded = true;
  }

  /**
   * ממיר טקסט ל-INT. ערך ריק -> 0. ערך לא מוכר -> נרשם אוטומטית (max+1).
   */
  async toInt(field: string, rawText: unknown): Promise<number> {
    if (!this.loaded) await this.load();
    const text = this.norm(rawText);
    if (!text || EMPTY_SENTINELS.includes(text.toLowerCase())) return 0;

    const fieldMap = this.cache.get(field);
    const existing = fieldMap?.get(text);
    if (existing !== undefined) return existing;

    // רישום אוטומטי של ערך חדש
    const next = (this.maxInt.get(field) ?? 0) + 1;
    try {
      await this.prisma.configMap.create({
        data: { field, textValue: text, intValue: next },
      });
    } catch {
      // מרוץ/כפילות — טען מחדש ונסה לשלוף
      await this.load();
      const again = this.cache.get(field)?.get(text);
      if (again !== undefined) return again;
    }
    if (!this.cache.has(field)) this.cache.set(field, new Map());
    this.cache.get(field)!.set(text, next);
    this.maxInt.set(field, next);
    this.logger.log(`רישום מיפוי חדש: ${field} "${text}" -> ${next}`);
    return next;
  }

  /**
   * resolver שאינו מתמיד, ל-preview/תכנון: ערך מוכר מוחזר לפי קודו; ערך לא מוכר מקבל קוד
   * זמני מתוך צילום זיכרון — ללא כתיבה ל-DB וללא שינוי ה-cache המשותף. כך ה-preview נשאר
   * נטול תופעות לוואי אך עדיין מפיק מפתחות יציבים להשוואה.
   */
  async previewResolver(): Promise<ConfigResolver> {
    if (!this.loaded) await this.load();
    const localCache = new Map<string, Map<string, number>>(
      [...this.cache].map(([field, m]) => [field, new Map(m)]),
    );
    const localMax = new Map(this.maxInt);
    return {
      toInt: async (field: string, rawText: unknown): Promise<number> => {
        const text = this.norm(rawText);
        if (!text || EMPTY_SENTINELS.includes(text.toLowerCase())) return 0;
        const existing = localCache.get(field)?.get(text);
        if (existing !== undefined) return existing;
        const next = (localMax.get(field) ?? 0) + 1;
        if (!localCache.has(field)) localCache.set(field, new Map());
        localCache.get(field)!.set(text, next);
        localMax.set(field, next);
        return next;
      },
    };
  }

  /** רשימת כל המיפויים (לתצוגה/עריכה). */
  async list(field?: string) {
    return this.prisma.configMap.findMany({
      where: field ? { field } : undefined,
      orderBy: [{ field: 'asc' }, { intValue: 'asc' }],
    });
  }

  /** כמה פריטים משתמשים במיפוי (field,textValue) — דרך עמודת ה-raw המתאימה. */
  private async usageCount(field: string, textValue: string): Promise<number> {
    const col = RAW_COLUMN_BY_FIELD[field];
    if (!col) return 0;
    return this.prisma.catalogItem.count({ where: { [col]: textValue } });
  }

  /**
   * עדכון/יצירה של מיפוי (עריכה ידנית). שינוי הקוד (intValue) של ערך שכבר בשימוש פריטים
   * נחסם: שינוי כזה ינתק את ה-entityId המאוחסן מהמילון. יצירת ערך חדש תמיד מותרת.
   */
  async upsert(field: string, textValue: string, intValue: number) {
    const text = this.norm(textValue);
    const existing = await this.prisma.configMap.findUnique({
      where: { field_text: { field, textValue: text } },
    });
    if (existing && existing.intValue !== intValue) {
      const inUse = await this.usageCount(field, text);
      if (inUse > 0) {
        throw new Error(
          `לא ניתן לשנות את הקוד של "${text}" בשדה ${field}: ${inUse} פריטים משתמשים בו, ` +
            `ושינוי הקוד ינתק את ה-entityId שלהם מהמילון. צור ערך חדש או בצע טעינה מחדש (reload-data).`,
        );
      }
    }
    const row = await this.prisma.configMap.upsert({
      where: { field_text: { field, textValue: text } },
      update: { intValue },
      create: { field, textValue: text, intValue },
    });
    await this.load();
    return row;
  }

  /** מחיקת מיפוי. נחסמת אם פריטים עדיין משתמשים בערך (כדי לא להשאיר entityId ללא מיפוי). */
  async remove(id: number) {
    const target = await this.prisma.configMap.findUnique({ where: { id } });
    if (!target) throw new Error('המיפוי לא נמצא');
    const inUse = await this.usageCount(target.field, target.textValue);
    if (inUse > 0) {
      throw new Error(
        `לא ניתן למחוק את "${target.textValue}" בשדה ${target.field}: ${inUse} פריטים משתמשים בו. ` +
          `מחיקה תשאיר את ה-entityId שלהם ללא מיפוי תקף.`,
      );
    }
    const row = await this.prisma.configMap.delete({ where: { id } });
    await this.load();
    return row;
  }
}
