import { Injectable, Logger } from '@nestjs/common';
import { CatalogItem } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GeoService } from '../geo/geo.service';
import { CatalogService } from '../catalog/catalog.service';
import { editDistance, fuzzyThreshold, normalizeHebrew } from '../common/hebrew';
import { GeminiService } from '../ai/gemini.service';
import { SYNONYMS } from './synonyms';

// מילות עזר בעברית — לא משמשות לחיפוש
const STOPWORDS = new Set(
  `אני אתה את אתם אנחנו הוא היא הם הן של על עם ב בב בבית גר גרה גרים
   מחפש מחפשת מחפשים רוצה רוצים צריך צריכה צריכים למצוא תן תני שיש
   איפה הכי קרוב אליי לי אלי אלינו עבור כדי שאני אשמח בבקשה גם כן
   לא כל מאוד יותר מאוד ואני שזה זה יש לי אצלי אצלנו איזה איזהו
   מה שמי שיכול אפשר אפשרות דבר דברים מוצר מוצרים פריט פריטים`
    .split(/\s+/)
    .filter(Boolean),
);

export interface ParsedQuery {
  product_terms: string[];
  search_phrase: string;
  location: string | null;
  location_normalized: string | null;
  explanation: string;
  parser: string;
}

/** זיכרון שיחה קצר (נשמר בצד הלקוח ומועבר הלוך-ושוב). */
export interface ChatContext {
  makat?: string | null;
  product?: string | null;
  awaitingLocation?: boolean;
  location?: string | null;
}

export interface ChatResponse {
  intent: 'search' | 'suppliers' | 'contact';
  reply: string;
  results?: Record<string, unknown>[];
  suppliers?: Record<string, unknown>[];
  quickReplies?: string[];
  followup?: 'location' | null;
  context: ChatContext;
}

/** קטגוריות ברירת מחדל להכוונה (רשת ביטחון + כפתורי פתיחה). */
const SUGGESTED_CATEGORIES = ['כיסא גלגלים', 'טיפול פסיכולוגי', 'מכשיר שמיעה', 'עדשות'];

/** בחירה אקראית מתוך מערך — לגיוון נוסח תשובות העוזר (מונע תחושת "בוט סטטי"). */
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly geo: GeoService,
    private readonly catalog: CatalogService,
    private readonly gemini: GeminiService,
  ) {}

  /** האם שכבת ה-AI (Gemini) פעילה (קיים מפתח API). */
  isAiEnabled(): boolean {
    return this.gemini.isEnabled();
  }

  private tokenize(text: string): string[] {
    const words = text.match(/[א-ת0-9][א-ת0-9\-]{1,}/g) || [];
    const tokens: string[] = [];
    for (const w of words) {
      if (STOPWORDS.has(w) || w.length < 2) continue;
      // שומרים את המילה המקורית (למשל "כיסא") — הסרת התחילית משמשת רק להרחבת התאמה
      tokens.push(w);
    }
    return tokens;
  }

  private removeCityFromText(text: string, city: string | null): string {
    if (!city) return text;
    let out = text;
    for (const variant of new Set([city, this.geo.normalizeCity(city)])) {
      if (variant) out = out.replace(new RegExp(this.escapeRegex(variant), 'gi'), ' ');
    }
    return out;
  }

  private escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  parseSmartQuery(query: string): ParsedQuery {
    const text = (query || '').trim();
    if (!text) {
      return {
        product_terms: [],
        search_phrase: '',
        location: null,
        location_normalized: null,
        explanation: 'שאילתה ריקה',
        parser: 'local',
      };
    }

    const locationRaw = this.geo.findCityInText(text);
    const locNorm = locationRaw ? this.geo.normalizeCity(locationRaw) : null;

    let withoutLoc = this.removeCityFromText(text, locationRaw);
    for (const pat of [
      /גר(?:ים|ה)?\s+ב[\-–]?\s*/g,
      /מתגורר(?:ת)?\s+ב[\-–]?\s*/g,
      /מגורים\s+ב[\-–]?\s*/g,
      /באזור\s+/g,
    ]) {
      withoutLoc = withoutLoc.replace(pat, ' ');
    }
    withoutLoc = withoutLoc.replace(/[^\p{L}\p{N}\s"'-]+/gu, ' ').replace(/\s+/g, ' ').trim();

    let terms = this.tokenize(withoutLoc);
    if (!terms.length && withoutLoc) terms = this.tokenize(text);

    let phrase = withoutLoc.length >= 3 ? withoutLoc : '';
    if (!phrase && terms.length) phrase = terms.slice(0, 6).join(' ');

    const explParts = ['חיפוש חכם מקומי (חינמי)'];
    if (phrase) explParts.push(`ביטוי: ${phrase.slice(0, 60)}`);
    if (terms.length) explParts.push(`מילים: ${terms.slice(0, 8).join(', ')}`);
    if (locNorm) explParts.push(`מיקום: ${locNorm}`);

    return {
      product_terms: terms,
      search_phrase: phrase,
      location: locationRaw,
      location_normalized: locNorm,
      explanation: explParts.join(' · '),
      parser: 'local',
    };
  }

  private itemRelevanceScore(desc: string, terms: string[], phrase: string): number {
    const d = normalizeHebrew(desc);
    let score = 0;
    const np = normalizeHebrew(phrase);
    if (np && np.length >= 3 && d.includes(np)) score += 12;
    for (const t of terms) {
      const nt = normalizeHebrew(t);
      if (nt.length >= 2 && d.includes(nt)) {
        score += nt.length >= 5 ? 4 : nt.length >= 4 ? 3 : 2;
      }
    }
    return score;
  }

  /** אוצר מילים מנורמל של הקטלוג (מילה מנורמלת -> צורות גולמיות). נבנה פעם אחת. */
  private vocab: Map<string, string[]> | null = null;

  private async getVocab(): Promise<Map<string, string[]>> {
    if (this.vocab) return this.vocab;
    const rows = await this.prisma.catalogItem.findMany({
      where: { isDeleted: false },
      select: { description: true },
    });
    const norm = new Map<string, string[]>();
    for (const r of rows) {
      const words = (r.description || '').match(/[א-ת]{2,}/g) || [];
      for (const w of words) {
        const nw = normalizeHebrew(w);
        if (nw.length < 2) continue;
        let arr = norm.get(nw);
        if (!arr) {
          arr = [];
          norm.set(nw, arr);
        }
        if (!arr.includes(w)) arr.push(w);
      }
    }
    this.vocab = norm;
    this.logger.log(`אוצר מילים נבנה: ${norm.size} מילים ייחודיות`);
    return norm;
  }

  /** מבטל את מטמון אוצר המילים (למשל אחרי טעינת נתונים). */
  invalidateVocab(): void {
    this.vocab = null;
  }

  /** מילון נרדפות מאוחד: ברירות מחדל סטטיות + רשומות DB (ניתן לעריכה). נבנה פעם אחת. */
  private synonymCache: Map<string, string[]> | null = null;

  private async getSynonyms(): Promise<Map<string, string[]>> {
    if (this.synonymCache) return this.synonymCache;
    const map = new Map<string, string[]>();
    const add = (term: string, targets: string[]) => {
      const nk = normalizeHebrew(term);
      if (!nk) return;
      const arr = map.get(nk) ?? [];
      for (const t of targets) if (t && !arr.includes(t)) arr.push(t);
      map.set(nk, arr);
    };
    for (const [k, vals] of Object.entries(SYNONYMS)) add(k, vals);
    try {
      const rows = await this.prisma.synonym.findMany();
      for (const r of rows) add(r.term, [r.target]);
    } catch {
      /* טבלה עשויה להיעדר לפני migration — נופלים לברירות המחדל */
    }
    this.synonymCache = map;
    return map;
  }

  invalidateSynonyms(): void {
    this.synonymCache = null;
  }

  private lookupSynonyms(map: Map<string, string[]>, text: string): string[] {
    const norm = normalizeHebrew(text);
    if (!norm) return [];
    const out = new Set<string>();
    if (map.has(norm)) map.get(norm)!.forEach((v) => out.add(v));
    for (const w of norm.split(' ')) if (map.has(w)) map.get(w)!.forEach((v) => out.add(v));
    return [...out];
  }

  /** הרחבת מונחים: מקור + נרדפות + התאמה סלחנית (fuzzy) מול אוצר המילים. */
  private async expandTerms(terms: string[], phrase: string): Promise<string[]> {
    const out = new Set<string>();
    for (const t of terms) if (t) out.add(t);
    const synMap = await this.getSynonyms();
    for (const s of this.lookupSynonyms(synMap, phrase)) out.add(s);
    for (const t of terms) for (const s of this.lookupSynonyms(synMap, t)) out.add(s);

    const vocab = await this.getVocab();
    for (const t of terms) {
      const nt = normalizeHebrew(t);
      if (nt.length < 2) continue;
      if (vocab.has(nt)) {
        for (const raw of vocab.get(nt)!) out.add(raw);
        continue;
      }
      const th = fuzzyThreshold(nt);
      const cand: { w: string; d: number }[] = [];
      for (const nw of vocab.keys()) {
        if (Math.abs(nw.length - nt.length) > th) continue;
        const d = editDistance(nw, nt);
        if (d <= th) cand.push({ w: nw, d });
      }
      cand.sort((a, b) => a.d - b.d);
      for (const c of cand.slice(0, 4)) for (const raw of vocab.get(c.w)!) out.add(raw);
    }
    return [...out];
  }

  private minRelevanceScore(terms: string[], phrase: string): number {
    if (phrase && phrase.length >= 4) return 2;
    if (terms.length <= 1) return 2;
    if (terms.length === 2) return 3;
    return 4;
  }

  private async searchItemsSmart(
    terms: string[],
    phrase: string,
    minScore: number,
    limit = 80,
  ): Promise<CatalogItem[]> {
    if (!terms.length && !phrase) return [];
    const clauses: { description: { contains: string } }[] = [];
    if (phrase && phrase.length >= 3) clauses.push({ description: { contains: phrase } });
    for (const t of terms) if (t && t.length >= 2) clauses.push({ description: { contains: t } });
    if (!clauses.length) return [];

    const rows = await this.prisma.catalogItem.findMany({
      where: { isDeleted: false, OR: clauses },
      take: limit * 5,
    });

    const scored = rows
      .map((item) => ({ score: this.itemRelevanceScore(item.description ?? '', terms, phrase), item }))
      .filter((s) => s.score >= minScore)
      .sort((a, b) => b.score - a.score || String(a.item.catalogNumber).localeCompare(String(b.item.catalogNumber)));
    return scored.slice(0, limit).map((s) => s.item);
  }

  /**
   * חיפוש ישיר לפי מזהה: קוד שירות משרד הבריאות (catalogPricelistNum) או מק"ט.
   * מטפל גם בקודים עם אותיות לטיניות (למשל T7825, BZ150) שהטוקנייזר מסנן.
   */
  private async searchByCode(query: string): Promise<CatalogItem[]> {
    const raw = (query || '').trim();
    if (!raw) return [];
    const toks = raw
      .split(/\s+/)
      .map((t) => t.replace(/[^0-9A-Za-zא-ת\-]/g, ''))
      .filter((t) => t.length >= 2);
    if (!toks.length) return [];
    const codeVariants = new Set<string>();
    for (const t of toks) {
      codeVariants.add(t);
      codeVariants.add(t.toUpperCase());
    }
    return this.prisma.catalogItem.findMany({
      where: {
        isDeleted: false,
        OR: [{ catalogPricelistNum: { in: [...codeVariants] } }, { catalogNumber: { in: toks } }],
      },
      take: 200,
    });
  }

  /** חיפוש חכם מלא: מחלץ מילים+מיקום, מדרג מק"טים וספקים לפי קרבה. */
  async runAiSearch(query: string, opts: { limitMakts?: number; itemLimit?: number } = {}) {
    const limitMakts = opts.limitMakts ?? 15;
    const itemLimit = opts.itemLimit ?? 80;
    const parsed = this.parseSmartQuery(query);
    const { product_terms: terms, search_phrase: phrase } = parsed;

    this.logger.log(
      `ai_search: phrase=${phrase.slice(0, 40)} terms=${terms.slice(0, 5)} city=${parsed.location_normalized}`,
    );

    // חיפוש ישיר לפי קוד שירות / מק"ט — בעדיפות עליונה
    const codeItems = await this.searchByCode(query);

    if (!terms.length && !phrase && !codeItems.length) {
      return this.emptyResult(query, parsed, 'לא זוהו מילות חיפוש. נסה לתאר את המוצר או השירות.');
    }

    // אם השאילתה היא בעצם רק קוד (אין מילת טקסט עברית) — לא מחפשים בתיאורים כדי למנוע רעש
    const hasTextTerms = terms.some((t) => /[א-ת]{2,}/.test(t));
    const runSmart = hasTextTerms || !codeItems.length;
    // הרחבה סלחנית + נרדפות
    let matchTerms = terms;
    let smartItems: CatalogItem[] = [];
    if (runSmart && (terms.length || phrase)) {
      matchTerms = await this.expandTerms(terms, phrase);
      const minScore = this.minRelevanceScore(terms, phrase);
      smartItems = await this.searchItemsSmart(matchTerms, phrase, minScore, itemLimit);
    }

    // מיזוג — התאמות קוד תחילה, ללא כפילויות
    const seen = new Set<string>();
    const items: CatalogItem[] = [];
    for (const it of [...codeItems, ...smartItems]) {
      if (!seen.has(it.entityId)) {
        seen.add(it.entityId);
        items.push(it);
      }
    }
    if (!items.length) {
      void this.logUnanswered(query);
      return this.emptyResult(query, parsed, 'לא נמצאו מקטים התואמים לתיאור. נסה ניסוח אחר.');
    }

    const codeMakats = new Set(codeItems.map((i) => String(i.catalogNumber)));
    const groups = await this.catalog.groupByMakt(items as any);
    groups.sort((a, b) => {
      // התאמות קוד שירות / מק"ט קודמות תמיד
      const ca = codeMakats.has(a.catalogNumber) ? 1 : 0;
      const cb = codeMakats.has(b.catalogNumber) ? 1 : 0;
      if (ca !== cb) return cb - ca;
      const rank = (g: typeof a) =>
        this.itemRelevanceScore(String(g.description ?? g.variants[0]?.description ?? ''), matchTerms, phrase);
      const ra = rank(a);
      const rb = rank(b);
      if (ra !== rb) return rb - ra;
      if ((a.supplier_count ?? 0) !== (b.supplier_count ?? 0)) return (b.supplier_count ?? 0) - (a.supplier_count ?? 0);
      return (b.variant_count ?? 0) - (a.variant_count ?? 0);
    });
    const topGroups = groups.slice(0, limitMakts);

    let userCity = (parsed.location_normalized || '').trim() || null;
    if (!userCity) {
      const retry = this.geo.findCityInText(query);
      if (retry) userCity = this.geo.normalizeCity(retry) || null;
    }

    const results: Record<string, any>[] = [];
    for (const g of topGroups) {
      const suppliers = await this.catalog.getSuppliersForMakt(g.catalogNumber);
      const ranked = this.geo.rankSuppliers(userCity, suppliers as any);
      const nearest = ranked.find((s) => s.is_nearest) ?? null;
      results.push({
        catalogNumber: g.catalogNumber,
        description: g.description ?? g.variants[0]?.description ?? null,
        variant_count: g.variant_count,
        supplier_count: ranked.length,
        variants: g.variants,
        suppliers: ranked,
        nearest_supplier: nearest,
        supplier_note:
          g.variant_count > 1 ? 'ספקים מורשים למק״ט — זהים לכל הוריאנטים' : null,
      });
    }

    return {
      query,
      parsed,
      engine: 'local',
      count: results.length,
      total_makts: groups.length,
      user_location: userCity,
      results,
      message: null,
    };
  }

  // ===== תיעוד שאילתות ללא מענה + ניהול נרדפות =====

  /** רושם שאילתה שלא הניבה תוצאות (upsert עם ספירה) — backlog לנרדפות. */
  async logUnanswered(rawQuery: string): Promise<void> {
    const q = normalizeHebrew(rawQuery);
    if (q.length < 2) return;
    try {
      await this.prisma.unansweredQuery.upsert({
        where: { query: q },
        update: { count: { increment: 1 }, rawSample: rawQuery.trim() },
        create: { query: q, rawSample: rawQuery.trim() },
      });
    } catch {
      /* תיעוד בלבד — לא לשבור חיפוש */
    }
  }

  listUnanswered(limit = 100) {
    return this.prisma.unansweredQuery.findMany({
      orderBy: [{ count: 'desc' }, { lastSeen: 'desc' }],
      take: limit,
    });
  }

  listSynonyms() {
    return this.prisma.synonym.findMany({ orderBy: [{ term: 'asc' }, { target: 'asc' }] });
  }

  async addSynonym(term: string, target: string) {
    const t = normalizeHebrew(term);
    const tgt = (target || '').trim();
    if (!t || !tgt) throw new Error('term/target חסרים');
    const row = await this.prisma.synonym.upsert({
      where: { term_target: { term: t, target: tgt } },
      update: {},
      create: { term: t, target: tgt },
    });
    this.invalidateSynonyms();
    return row;
  }

  async deleteSynonym(id: number) {
    await this.prisma.synonym.delete({ where: { id } });
    this.invalidateSynonyms();
    return { deleted: id };
  }

  private emptyResult(query: string, parsed: ParsedQuery, message: string) {
    return {
      query,
      parsed,
      engine: 'local',
      count: 0,
      total_makts: 0,
      user_location: null as string | null,
      results: [] as Record<string, unknown>[],
      message,
    };
  }

  /**
   * השלמה אוטומטית: הצעות מונחים קיימים מהקטלוג (תיאורים + קודי שירות/מק"ט)
   * לפי טקסט חלקי — להכוונת המשתמש למונחים קיימים.
   */
  async suggest(q: string, limit = 8): Promise<string[]> {
    const raw = (q || '').trim();
    if (raw.length < 2) return [];
    const rows = await this.prisma.catalogItem.findMany({
      where: {
        isDeleted: false,
        OR: [
          { description: { contains: raw } },
          { catalogPricelistNum: { startsWith: raw } },
          { catalogNumber: { startsWith: raw } },
        ],
      },
      select: { description: true, catalogPricelistNum: true, catalogNumber: true },
      take: 120,
    });
    const nq = normalizeHebrew(raw);
    const out = new Set<string>();
    // קודי שירות / מק"ט שמתחילים בטקסט
    for (const r of rows) {
      if (r.catalogPricelistNum && r.catalogPricelistNum.toUpperCase().startsWith(raw.toUpperCase())) {
        out.add(r.catalogPricelistNum);
      }
      if (out.size >= limit) break;
    }
    // תיאורי מוצר תואמים
    for (const r of rows) {
      if (out.size >= limit) break;
      const desc = (r.description || '').trim();
      if (desc && normalizeHebrew(desc).includes(nq)) out.add(desc);
    }
    return [...out].slice(0, limit);
  }

  // ===== שכבת שיחה: זיהוי כוונה + זיכרון קצר =====

  /** סיווג כוונת המשתמש לפי מילות מפתח (ללא LLM). השוואה על טקסט מנורמל. */
  private classifyIntent(text: string): 'search' | 'suppliers' | 'contact' {
    const t = normalizeHebrew(text);
    const has = (words: string[]) => words.some((w) => t.includes(normalizeHebrew(w)));
    if (
      has(['טלפון', 'נייד', 'מייל', 'דוא"ל', 'כתובת', 'ליצור קשר', 'יצירת קשר', 'איך מתקשרים', 'פרטי קשר', 'מספר של'])
    ) {
      return 'contact';
    }
    if (has(['מספק', 'נותן שירות', 'מי נותן', 'ספקים', 'מורשה', 'מורשים', 'היכן אפשר', 'איפה אפשר'])) {
      return 'suppliers';
    }
    return 'search';
  }

  /** ניסיון לזהות מק"ט/קוד שירות בתוך הטקסט. */
  private async resolveMakatFromText(text: string): Promise<string | null> {
    const items = await this.searchByCode(text);
    return items[0]?.catalogNumber ?? null;
  }

  /** מילות כוונה/שאלה שיש להסיר לפני חיפוש מוצר בתוך שאלת ספקים/קשר. */
  private static readonly INTENT_WORDS = [
    'מי', 'מספק', 'מספקים', 'נותן', 'נותנים', 'שירות', 'ספק', 'ספקים', 'מורשה', 'מורשים',
    'טלפון', 'נייד', 'מייל', 'דוא"ל', 'כתובת', 'פרטי', 'קשר', 'של', 'מה', 'מהו', 'היכן',
    'איפה', 'אפשר', 'להשיג', 'את',
  ];

  private stripIntentWords(text: string): string {
    const stop = new Set(SearchService.INTENT_WORDS.map((w) => normalizeHebrew(w)));
    const isStop = (w: string): boolean => {
      const n = normalizeHebrew(w);
      if (stop.has(n)) return true;
      // גם צורה עם ה"א הידיעה מובילה (למשל "הטלפון" -> "טלפון")
      return n.startsWith('ה') && n.length > 2 && stop.has(n.slice(1));
    };
    return text
      .split(/\s+/)
      .map((w) => w.replace(/[^0-9A-Za-zא-ת-]/g, ''))
      .filter((w) => w && !isStop(w))
      .join(' ')
      .trim();
  }

  private searchReply(res: Awaited<ReturnType<SearchService['runAiSearch']>>, ctx: ChatContext): ChatResponse {
    ctx.makat = (res.results[0]?.catalogNumber as string) ?? ctx.makat ?? null;
    ctx.location = (res.user_location as string | null) ?? ctx.location ?? null;
    const total = res.total_makts;
    const shown = Math.min(res.results.length, 4);
    const countText =
      total > shown
        ? pick([
            `מצאתי ${total} מק"טים מתאימים — הנה ${shown} המובילים`,
            `יש ${total} מק"טים תואמים, אלה ${shown} המובילים`,
            `הנה ${shown} המובילים מתוך ${total} מק"טים שמצאתי`,
          ])
        : pick([
            `הנה ${total} התוצאות`,
            `מצאתי ${total} תוצאות מתאימות`,
            `אלה ${total} התוצאות שמצאתי`,
          ]);
    // התוצאות ממוינות לפי מספר הספקים יורד — אם למובילה אין ספקים, לאף אחת אין,
    // ואז לא מציעים "מי מספק?" / "מה הטלפון?" (אין למי להפנות).
    const hasSuppliers = ((res.results[0]?.supplier_count as number) ?? 0) > 0;
    const locationSuffix = res.user_location ? ` · ${res.user_location}` : '';
    const prompt = hasSuppliers
      ? pick([
          'אפשר ללחוץ לפתיחה, או לשאול "מי מספק?" / "מה הטלפון?":',
          'לחצו לפתיחה, או שאלו "מי מספק?" לרשימת הספקים המורשים:',
          'אפשר לפתוח מק"ט, או לבדוק "מי מספק?" ו"מה הטלפון?":',
        ])
      : pick(['אפשר ללחוץ לפתיחה:', 'לחצו על מק"ט כדי לפתוח את הפרטים:']);
    return {
      intent: 'search',
      context: ctx,
      reply: `${countText}${locationSuffix}. ${prompt}`,
      results: res.results.slice(0, 4),
      quickReplies: hasSuppliers ? ['מי מספק?', 'מה הטלפון?', 'חיפוש חדש'] : ['חיפוש חדש'],
    };
  }

  /**
   * נקודת הכניסה לשיחה: קודם שולפת נתונים מעוגנים (chatLocal — כוונה + מק"טים + ספקים),
   * ואז — אם Gemini פעיל — מנסחת תשובה טבעית המבוססת אך ורק על הנתונים שנשלפו (RAG).
   * הכרטיסים/הספקים/הכפתורים נשמרים כפי שהם; רק נוסח התשובה הופך לחכם יותר.
   */
  async chat(message: string, ctxIn: ChatContext = {}): Promise<ChatResponse> {
    const base = await this.chatLocal(message, ctxIn);
    try {
      const aiReply = await this.aiReply(message, base);
      if (aiReply) base.reply = aiReply;
    } catch (e) {
      this.logger.warn(`שכבת AI נכשלה — משתמש בתשובה המקומית: ${(e as Error).message}`);
    }
    return base;
  }

  /**
   * מנסח תשובה בעזרת Gemini על סמך הנתונים שנשלפו בלבד (grounding).
   * מחזיר null אם ה-AI כבוי או נכשל — ואז נשמרת התשובה המקומית.
   */
  private async aiReply(userMessage: string, base: ChatResponse): Promise<string | null> {
    if (!this.gemini.isEnabled()) return null;

    const results = (base.results ?? []).slice(0, 5).map((r) => ({
      makat: r.catalogNumber,
      description: r.description,
      supplier_count: r.supplier_count,
      nearest_supplier: (r.nearest_supplier as { name?: string } | null)?.name ?? null,
    }));
    const suppliers = (base.suppliers ?? []).slice(0, 6).map((s) => ({
      name: (s as any).name ?? null,
      phone: (s as any).mobile || (s as any).workPhone || (s as any).landline || null,
      city: (s as any).city ?? null,
      profession: (s as any).profession ?? null,
      proximity: (s as any).proximity_label ?? null,
    }));

    const data = { intent: base.intent, results, suppliers };
    const hasData = results.length > 0 || suppliers.length > 0;

    const systemInstruction = [
      'אתה העוזר החכם של מערכת השיקום של אגף השיקום.',
      'ענה בעברית, בטון ידידותי, מקצועי ותמציתי (2-4 משפטים).',
      'הסתמך אך ורק על הנתונים שסופקו לך (JSON). אל תמציא מק"טים, ספקים, טלפונים או עובדות שאינן בנתונים.',
      'אל תמציא מחירים או זמינות. אם אין נתונים, אמור זאת בכנות והצע לנסח מחדש או לבחור קטגוריה.',
      'אל תחזור על רשימת התוצאות באופן מלא — הן מוצגות בכרטיסים נפרדים. סכם והכוון את המשתמש.',
      'אל תשתמש ב-Markdown, בכוכביות או בטבלאות — טקסט רגיל בלבד.',
    ].join(' ');

    const prompt = [
      `שאלת המשתמש: "${userMessage}"`,
      '',
      'נתוני המערכת שנשלפו (הבסיס היחיד לתשובתך):',
      JSON.stringify(data, null, 2),
      '',
      hasData
        ? 'נסח תשובה קצרה שמסבירה מה נמצא ומכוונת את המשתמש להמשך (למשל לפתוח מק"ט, לבקש ספקים או פרטי קשר).'
        : 'לא נמצאו נתונים מתאימים — הסבר זאת בעדינות והצע לנסח מחדש או לבחור קטגוריה.',
    ].join('\n');

    return this.gemini.generate(systemInstruction, prompt);
  }

  /**
   * שכבת השיחה המקומית (ללא LLM): מפרקת את המשפט לכוונה + ישות,
   * שומרת זיכרון קצר (המק"ט האחרון), ומחזירה תשובה מובנית + נתונים מעוגנים.
   */
  async chatLocal(message: string, ctxIn: ChatContext = {}): Promise<ChatResponse> {
    const text = (message || '').trim();
    const ctx: ChatContext = { ...ctxIn };

    const intent = this.classifyIntent(text);

    // המשך שאלת מיקום — רק כשמחכים ליישוב וזו תשובת חיפוש רגילה (לא ספקים/קשר)
    if (ctx.awaitingLocation && ctx.product && intent === 'search') {
      const skip = /^(דלג|לא משנה|לא חשוב|אין|לא)$/.test(normalizeHebrew(text));
      const isCity = !!this.geo.findCityInText(text);
      if (skip || isCity) {
        const product = ctx.product;
        const res = await this.runAiSearch(skip ? product : `${product} ${text}`);
        ctx.awaitingLocation = false;
        ctx.product = null;
        if (!res.count) {
          ctx.location = null;
          return {
            intent: 'search',
            context: ctx,
            reply: 'לא נמצאו תוצאות. נסו לנסח מחדש או בחרו קטגוריה:',
            quickReplies: SUGGESTED_CATEGORIES,
          };
        }
        return this.searchReply(res, ctx);
      }
      // התשובה אינה יישוב ואינה "דלג" — כנראה נושא חדש: משחררים את המתנת המיקום וממשיכים
      ctx.awaitingLocation = false;
      ctx.product = null;
    }

    // כוונת ספקים / פרטי קשר — נענה גם בתור אחד ("מי מספק כיסא גלגלים?")
    if (intent === 'contact' || intent === 'suppliers') {
      ctx.awaitingLocation = false;
      ctx.product = null;
      let makat = await this.resolveMakatFromText(text);
      if (!makat) {
        const cleaned = this.stripIntentWords(text);
        if (cleaned.length >= 2) {
          const res = await this.runAiSearch(cleaned);
          if (res.count) {
            makat = res.results[0].catalogNumber as string;
            if (res.user_location) ctx.location = res.user_location;
          }
        }
      }
      makat = makat ?? ctx.makat ?? null;
      if (!makat) {
        return {
          intent,
          context: ctx,
          reply: 'על איזה מוצר או מק"ט? כתבו מק"ט, קוד שירות או שם מוצר ואחזיר את הספקים המורשים.',
          quickReplies: SUGGESTED_CATEGORIES,
        };
      }
      const suppliers = await this.catalog.getSuppliersForMakt(makat);
      ctx.makat = makat;
      if (!suppliers.length) {
        return { intent, context: ctx, reply: `לא נמצאו ספקים מורשים למק"ט ${makat}.`, quickReplies: ['חיפוש חדש'] };
      }
      const city = ctx.location ? this.geo.normalizeCity(ctx.location) : null;
      const ranked = this.geo.rankSuppliers(city, suppliers as any);
      const reply =
        intent === 'contact'
          ? pick([
              `פרטי הקשר של הספקים המורשים למק"ט ${makat} (${ranked.length}):`,
              `הנה פרטי הקשר לספקים המורשים של מק"ט ${makat} (${ranked.length}):`,
              `מצאתי ${ranked.length} ספקים מורשים למק"ט ${makat} — אלה פרטי הקשר:`,
            ])
          : pick([
              `הספקים המורשים למק"ט ${makat} (${ranked.length}):`,
              `אלה הספקים המורשים למק"ט ${makat} (${ranked.length}):`,
              `מצאתי ${ranked.length} ספקים מורשים למק"ט ${makat}:`,
            ]);
      return { intent, context: ctx, reply, suppliers: ranked, quickReplies: ['חיפוש חדש'] };
    }

    // כוונת חיפוש מוצר
    if (text.length < 2) {
      return {
        intent: 'search',
        context: ctx,
        reply: 'מה תרצו לחפש? אפשר לתאר מוצר או שירות, מק"ט או קוד שירות.',
        quickReplies: SUGGESTED_CATEGORIES,
      };
    }
    const res = await this.runAiSearch(text);
    if (!res.count) {
      return {
        intent: 'search',
        context: ctx,
        reply: res.message || 'לא נמצאו תוצאות. נסו לנסח מחדש או בחרו קטגוריה:',
        quickReplies: SUGGESTED_CATEGORIES,
      };
    }
    ctx.makat = (res.results[0]?.catalogNumber as string) ?? null;
    // אם אין מיקום — שאלת הכוונה על יישוב
    if (!res.user_location) {
      ctx.product = text;
      ctx.awaitingLocation = true;
      const terms = res.parsed.product_terms.join(', ') || text;
      return {
        intent: 'search',
        context: ctx,
        followup: 'location',
        reply: `מצאתי ${res.total_makts} מק"טים לגבי "${terms}". באיזה יישוב אתם? כך אאתר את הספק הקרוב ביותר. (אפשר "דלג")`,
        results: res.results.slice(0, 4),
        quickReplies: ['דלג'],
      };
    }
    return this.searchReply(res, ctx);
  }
}
