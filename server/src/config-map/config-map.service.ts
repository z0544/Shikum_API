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

/**
 * מנוע הקונפיגורציה: ממיר טקסט מה-XLSX לערך INT דרך מילון הניתן לעריכה.
 * ערך שאינו קיים נרשם אוטומטית עם ה-INT הפנוי הבא (כדי לשמור על ID מספרי ויציב).
 * ערך ריק -> 0 (ברירת מחדל).
 */
@Injectable()
export class ConfigMapService {
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
    if (!text || ['nan', 'none', '<na>'].includes(text.toLowerCase())) return 0;

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

  /** רשימת כל המיפויים (לתצוגה/עריכה). */
  async list(field?: string) {
    return this.prisma.configMap.findMany({
      where: field ? { field } : undefined,
      orderBy: [{ field: 'asc' }, { intValue: 'asc' }],
    });
  }

  /** עדכון/יצירה של מיפוי (עריכה ידנית). */
  async upsert(field: string, textValue: string, intValue: number) {
    const row = await this.prisma.configMap.upsert({
      where: { field_text: { field, textValue: this.norm(textValue) } },
      update: { intValue },
      create: { field, textValue: this.norm(textValue), intValue },
    });
    await this.load();
    return row;
  }

  /** מחיקת מיפוי. */
  async remove(id: number) {
    const row = await this.prisma.configMap.delete({ where: { id } });
    await this.load();
    return row;
  }
}
