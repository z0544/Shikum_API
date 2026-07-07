import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import { dataFile } from '../common/paths';
import {
  BUILTIN_SETTLEMENTS,
  CITY_ALIASES,
  CITY_COORDINATES,
  DISTRICT_ALIASES,
  DISTRICT_CENTROIDS,
  UNKNOWN_DISTANCE_KM,
} from './geo.data';

/** דמיון מחרוזות בנוסח difflib.SequenceMatcher.ratio (0..1) מבוסס Levenshtein. */
function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const m = a.length;
  const n = b.length;
  const dp: number[] = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : Math.min(prev, dp[j], dp[j - 1]) + 1;
      prev = tmp;
    }
  }
  const dist = dp[n];
  return 1 - dist / Math.max(m, n);
}

function closeMatch(word: string, candidates: string[], cutoff: number): string | null {
  let best: string | null = null;
  let bestScore = cutoff;
  for (const c of candidates) {
    const s = similarity(word, c);
    if (s >= bestScore) {
      bestScore = s;
      best = c;
    }
  }
  return best;
}

export interface RankedSupplier extends Record<string, unknown> {
  distance_km: number | null;
  proximity_score: number;
  proximity_label: string;
  is_nearest: boolean;
}

/**
 * שירות גיאוגרפי: מיפוי יישוב->מחוז (העשרה) ודירוג קרבה לספקים.
 * מקביל ל-geo_service.py.
 */
@Injectable()
export class GeoService {
  private readonly logger = new Logger(GeoService.name);
  private settlementDistrict: Record<string, string> | null = null;
  private knownCityNames: Set<string> | null = null;
  private settlementNamesLongestFirst: string[] | null = null;

  private normalizeText(text: unknown): string {
    return String(text ?? '')
      .normalize('NFKC')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  normalizeDistrict(name: string | null | undefined): string | null {
    if (!name) return null;
    const raw = String(name).trim();
    if (!raw) return null;
    const key = this.normalizeText(raw);
    for (const [alias, canonical] of Object.entries(DISTRICT_ALIASES)) {
      if (this.normalizeText(alias) === key) return canonical;
    }
    if (raw.startsWith('מחוז')) return raw;
    if (raw === 'רמת הגולן') return raw;
    return raw.startsWith('ה') ? `מחוז ${raw.slice(1)}` : `מחוז ${raw}`;
  }

  normalizeCity(name: string | null | undefined): string {
    if (!name) return '';
    const raw = String(name).trim();
    if (!raw) return '';
    const key = this.normalizeText(raw);
    for (const [alias, canonical] of Object.entries(CITY_ALIASES)) {
      if (this.normalizeText(alias) === key) return canonical;
    }
    if (raw in BUILTIN_SETTLEMENTS || raw in CITY_COORDINATES) return raw;
    const allNames = [...Object.keys(CITY_COORDINATES), ...Object.keys(BUILTIN_SETTLEMENTS)];
    const match = closeMatch(raw, allNames, 0.82);
    return match ?? raw;
  }

  private loadSettlementDistrictMap(): Record<string, string> {
    if (this.settlementDistrict) return this.settlementDistrict;
    const mapping: Record<string, string> = { ...BUILTIN_SETTLEMENTS };
    const csvPath = dataFile(process.env.GEO_MAPPING_FILE || 'geo_mapping.csv');
    try {
      if (fs.existsSync(csvPath)) {
        const raw = fs.readFileSync(csvPath, 'utf-8').replace(/^﻿/, '');
        const lines = raw.split(/\r?\n/).filter((l) => l.trim());
        const header = lines[0].split(',').map((h) => h.trim());
        const cityIdx = header.findIndex((h) => h === 'יישוב' || h === 'יישוב קליניקה');
        const distIdx = header.findIndex((h) => h === 'מחוז' || h === 'אזור');
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(',');
          const city = (cols[cityIdx] || '').trim();
          const district = (cols[distIdx] || '').trim();
          if (city && district) {
            mapping[city] = this.normalizeDistrict(district) || district;
          }
        }
      }
    } catch (e) {
      this.logger.warn(`טעינת geo_mapping.csv נכשלה: ${(e as Error).message}`);
    }
    this.settlementDistrict = mapping;
    return mapping;
  }

  /** מחוז לפי שם יישוב (העשרת נתונים). */
  getDistrict(city: string | null | undefined): string | null {
    if (!city) return null;
    const norm = this.normalizeCity(city);
    const d = this.loadSettlementDistrictMap()[norm];
    return d ? this.normalizeDistrict(d) : null;
  }

  private knownCities(): Set<string> {
    if (this.knownCityNames) return this.knownCityNames;
    const names = new Set<string>(Object.keys(CITY_COORDINATES));
    Object.keys(this.loadSettlementDistrictMap()).forEach((n) => names.add(n));
    Object.values(CITY_ALIASES).forEach((n) => names.add(n));
    this.knownCityNames = names;
    return names;
  }

  private allSettlementNames(): string[] {
    if (this.settlementNamesLongestFirst) return this.settlementNamesLongestFirst;
    const names = new Set<string>(Object.keys(this.loadSettlementDistrictMap()));
    Object.keys(CITY_ALIASES).forEach((n) => names.add(n));
    Object.values(CITY_ALIASES).forEach((n) => names.add(n));
    Object.keys(CITY_COORDINATES).forEach((n) => names.add(n));
    this.settlementNamesLongestFirst = [...names].sort((a, b) => b.length - a.length);
    return this.settlementNamesLongestFirst;
  }

  getCoordinates(city: string | null | undefined): [number, number] | null {
    const norm = this.normalizeCity(city || '');
    if (!norm) return null;
    if (norm in CITY_COORDINATES) return CITY_COORDINATES[norm];
    const match = closeMatch(norm, Object.keys(CITY_COORDINATES), 0.85);
    if (match) return CITY_COORDINATES[match];
    const district = this.getDistrict(norm);
    if (district && district in DISTRICT_CENTROIDS) return DISTRICT_CENTROIDS[district];
    return null;
  }

  private findMultiwordCity(normText: string): string | null {
    const words = normText.match(/[א-ת][א-ת\-']{1,}/g) || [];
    if (words.length < 2) return null;
    const known = this.knownCities();
    let best: string | null = null;
    let bestLen = 0;
    for (const n of [3, 2]) {
      for (let i = 0; i <= words.length - n; i++) {
        const phrase = words.slice(i, i + n).join(' ');
        if (phrase.length < 4) continue;
        const cand = this.normalizeCity(phrase);
        if (known.has(cand) && phrase.length > bestLen) {
          best = cand;
          bestLen = phrase.length;
        }
      }
    }
    return best;
  }

  private cityFromChunk(chunk: string): string | null {
    let c = chunk.trim().replace(/^[ .,;"']+|[ .,;"']+$/g, '');
    c = c.split(/\s+(?:ו|ש|עם|ל|שאני)\s+/)[0].trim();
    if (c.length < 3) return null;
    const city = this.normalizeCity(c);
    if (this.getCoordinates(city) || this.getDistrict(city)) return city;
    const match = closeMatch(c, Object.keys(CITY_COORDINATES), 0.85);
    return match;
  }

  /** מזהה יישוב מתוך טקסט חופשי (לחיפוש חכם). */
  findCityInText(text: string): string | null {
    if (!text) return null;
    const normText = this.normalizeText(text);

    const phraseCity = this.findMultiwordCity(normText);
    if (phraseCity) return phraseCity;

    for (const city of this.allSettlementNames()) {
      const cn = this.normalizeText(city);
      if (cn.length >= 3 && normText.includes(cn)) return this.normalizeCity(city);
    }

    const aliasEntries = Object.entries(CITY_ALIASES).sort((a, b) => b[0].length - a[0].length);
    for (const [alias, canonical] of aliasEntries) {
      if (alias.length >= 3 && normText.includes(this.normalizeText(alias))) return canonical;
    }

    const patterns: RegExp[] = [
      /גר(?:ים|ה)?\s+ב[\-–]?\s*([א-ת"'\-\s]{2,35})/,
      /מתגורר(?:ת)?\s+ב[\-–]?\s*([א-ת"'\-\s]{2,35})/,
      /מגורים\s+ב[\-–]?\s*([א-ת"'\-\s]{2,35})/,
      /באזור\s+([א-ת"'\-\s]{2,35})/,
      /(?:^|\s)(?:קרוב|ליד)\s+([א-ת"'\-\s]{2,25})\s*$/,
      /(?:^|\s)ב[\-–]?\s+([א-ת"'\-\s]{2,25})\s*$/,
    ];
    for (const pat of patterns) {
      const m = text.match(pat);
      if (m) {
        const found = this.cityFromChunk(m[1]);
        if (found) return found;
      }
    }
    return null;
  }

  getSupplierDistrict(supplier: Record<string, unknown>): string | null {
    const raw = supplier['district'] ?? supplier['אזור'];
    if (raw) {
      const d = this.normalizeDistrict(String(raw));
      if (d) return d;
    }
    return this.getDistrict(this.normalizeCity(String(supplier['city'] ?? supplier['יישוב'] ?? '')));
  }

  private haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const r = 6371.0;
    const p = Math.PI / 180.0;
    const a =
      0.5 -
      Math.cos((lat2 - lat1) * p) / 2 +
      (Math.cos(lat1 * p) * Math.cos(lat2 * p) * (1 - Math.cos((lon2 - lon1) * p))) / 2;
    return 2 * r * Math.asin(Math.sqrt(Math.max(0, Math.min(1, a))));
  }

  distanceKm(userCity: string | null, supplierCity: string | null): number {
    const userNorm = this.normalizeCity(userCity || '');
    const supNorm = this.normalizeCity(supplierCity || '');
    if (userNorm && supNorm && userNorm === supNorm) return 0.0;

    const u = this.getCoordinates(userNorm);
    const s = this.getCoordinates(supNorm);
    if (u && s) return this.haversineKm(u[0], u[1], s[0], s[1]);

    const userD = this.getDistrict(userNorm);
    const supD = this.getDistrict(supNorm);
    if (userD && supD && userD === supD) return 35.0;

    if (u && supD && supD in DISTRICT_CENTROIDS) {
      const c = DISTRICT_CENTROIDS[supD];
      return this.haversineKm(u[0], u[1], c[0], c[1]);
    }
    if (s && userD && userD in DISTRICT_CENTROIDS) {
      const c = DISTRICT_CENTROIDS[userD];
      return this.haversineKm(c[0], c[1], s[0], s[1]);
    }
    return UNKNOWN_DISTANCE_KM;
  }

  private labelForDistance(
    km: number,
    opts: { sameCity: boolean; sameDistrict: boolean },
  ): string {
    if (opts.sameCity || km < 0.5) return 'אותו יישוב';
    const kmRound = Math.max(1, Math.round(km));
    if (km <= 15) return `כ-${kmRound} ק"מ · קרוב מאוד`;
    if (km <= 40) return opts.sameDistrict ? `כ-${kmRound} ק"מ · אותו מחוז` : `כ-${kmRound} ק"מ`;
    if (km <= 90)
      return opts.sameDistrict ? `כ-${kmRound} ק"מ · אותו מחוז` : `כ-${kmRound} ק"מ · מרחק בינוני`;
    if (km < 500) return `כ-${kmRound} ק"מ`;
    return 'מרחק לא ידוע';
  }

  proximityScore(
    userCity: string | null,
    supplier: Record<string, unknown>,
    distance?: number,
  ): [number, string] {
    if (!userCity) return [0, ''];
    const userNorm = this.normalizeCity(userCity);
    const supCity = this.normalizeCity(String(supplier['city'] ?? supplier['יישוב'] ?? ''));
    const km = distance !== undefined ? distance : this.distanceKm(userNorm, supCity);
    const userD = this.getDistrict(userNorm);
    const supD = this.getSupplierDistrict(supplier);
    const sameCity = Boolean(userNorm && supCity && userNorm === supCity);
    const sameDistrict = Boolean(userD && supD && userD === supD);
    const label = this.labelForDistance(km, { sameCity, sameDistrict });
    if (km >= UNKNOWN_DISTANCE_KM) return [50, label];
    const score = Math.max(0, Math.min(1000, Math.trunc(1000 - km * 8)));
    return [score, label];
  }

  /** מדרג ספקים לפי קרבה ליישוב המשתמש; מסמן את הקרוב ביותר. */
  rankSuppliers(userCity: string | null, suppliers: Record<string, unknown>[]): RankedSupplier[] {
    const userNorm = userCity ? this.normalizeCity(userCity) : '';
    const enriched: RankedSupplier[] = suppliers.map((s) => {
      const supCity = String(s['city'] ?? s['יישוב'] ?? '');
      const km = userNorm ? this.distanceKm(userNorm, supCity) : UNKNOWN_DISTANCE_KM;
      const [score, label] = this.proximityScore(userNorm, s, km);
      return {
        ...s,
        distance_km: km >= UNKNOWN_DISTANCE_KM ? null : Math.round(km * 10) / 10,
        proximity_score: score,
        proximity_label: label,
        is_nearest: false,
      };
    });

    enriched.sort((a, b) => {
      const da = a.distance_km ?? 9999;
      const db = b.distance_km ?? 9999;
      if (da !== db) return da - db;
      return String(a['name'] ?? a['שם ספק'] ?? '').localeCompare(String(b['name'] ?? ''));
    });

    if (enriched.length && userNorm) enriched[0].is_nearest = true;
    return enriched;
  }
}
