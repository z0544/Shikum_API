import { Injectable, Logger } from '@nestjs/common';
import { CatalogItem } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GeoService } from '../geo/geo.service';
import { CatalogService } from '../catalog/catalog.service';

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

const HE_PREFIXES = ['ול', 'ל', 'ב', 'מ', 'ה', 'ו', 'כ', 'ש'];

export interface ParsedQuery {
  product_terms: string[];
  search_phrase: string;
  location: string | null;
  location_normalized: string | null;
  explanation: string;
  parser: string;
}

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly geo: GeoService,
    private readonly catalog: CatalogService,
  ) {}

  private stripHebrewPrefix(word: string): string {
    let w = word.trim();
    for (let iter = 0; iter < 2; iter++) {
      let changed = false;
      for (const p of HE_PREFIXES) {
        if (w.startsWith(p) && w.length > p.length + 1) {
          w = w.slice(p.length);
          changed = true;
          break;
        }
      }
      if (!changed) break;
    }
    return w;
  }

  private tokenize(text: string): string[] {
    const words = text.match(/[א-ת0-9][א-ת0-9\-]{1,}/g) || [];
    const tokens: string[] = [];
    for (const w of words) {
      if (STOPWORDS.has(w) || w.length < 2) continue;
      const root = this.stripHebrewPrefix(w);
      if (root && !STOPWORDS.has(root) && root.length >= 2) tokens.push(root);
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
    const d = desc.toLowerCase();
    let score = 0;
    if (phrase && phrase.length >= 3 && d.includes(phrase.toLowerCase())) score += 12;
    if (!terms.length) return score;
    let matched = 0;
    for (const t of terms) {
      const tl = t.toLowerCase();
      if (d.includes(tl)) {
        matched += 1;
        score += tl.length >= 5 ? 4 : tl.length >= 4 ? 3 : 2;
      }
    }
    if (matched === terms.length) score += 6;
    else if (matched && matched >= Math.max(1, Math.floor(terms.length / 2))) score += 3;
    return score;
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
    limit = 80,
  ): Promise<CatalogItem[]> {
    if (!terms.length && !phrase) return [];
    const clauses: { description: { contains: string } }[] = [];
    if (phrase && phrase.length >= 3) clauses.push({ description: { contains: phrase } });
    for (const t of terms) clauses.push({ description: { contains: t } });
    if (!clauses.length) return [];

    const rows = await this.prisma.catalogItem.findMany({
      where: { isDeleted: false, OR: clauses },
      take: limit * 5,
    });

    const minScore = this.minRelevanceScore(terms, phrase);
    const scored = rows
      .map((item) => ({ score: this.itemRelevanceScore(item.description ?? '', terms, phrase), item }))
      .filter((s) => s.score >= minScore)
      .sort((a, b) => b.score - a.score || String(a.item.catalogNumber).localeCompare(String(b.item.catalogNumber)));
    return scored.slice(0, limit).map((s) => s.item);
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

    if (!terms.length && !phrase) {
      return this.emptyResult(query, parsed, 'לא זוהו מילות חיפוש. נסה לתאר את המוצר או השירות.');
    }

    const items = await this.searchItemsSmart(terms, phrase, itemLimit);
    if (!items.length) {
      return this.emptyResult(query, parsed, 'לא נמצאו מקטים התואמים לתיאור. נסה ניסוח אחר.');
    }

    const groups = await this.catalog.groupByMakt(items as any);
    groups.sort((a, b) => {
      const rank = (g: typeof a) =>
        this.itemRelevanceScore(String(g.description ?? g.variants[0]?.description ?? ''), terms, phrase);
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
      user_location: userCity,
      results,
      message: null,
    };
  }

  private emptyResult(query: string, parsed: ParsedQuery, message: string) {
    return { query, parsed, engine: 'local', count: 0, results: [], message };
  }
}
