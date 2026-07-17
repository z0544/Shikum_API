import {
  BadRequestException,
  Controller,
  DefaultValuePipe,
  Get,
  NotFoundException,
  Param,
  ParseBoolPipe,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { CatalogService } from './catalog.service';

/** בקרים לחיפוש פריטים, פרטי וריאנט וספקים מורשים. */
@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('api/items')
  async listItems(
    @Query('q') q: string,
    @Query('match', new DefaultValuePipe('contains')) match: string,
    @Query('field', new DefaultValuePipe('all')) field: string,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
    @Query('grouped', new DefaultValuePipe(true), ParseBoolPipe) grouped: boolean,
  ) {
    if (!q || !q.trim()) throw new BadRequestException('נדרש ערך לחיפוש (q)');
    const cappedLimit = Math.min(Math.max(limit, 1), 500);
    let payload;
    try {
      payload = await this.catalog.search({ q, match, field, limit: cappedLimit, grouped });
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    if ((payload.count as number) === 0) throw new NotFoundException('לא נמצאו תוצאות');
    return payload;
  }

  @Get('api/item/:entityId')
  async getItem(
    @Param('entityId') entityId: string,
    @Query('history_limit', new DefaultValuePipe(20), ParseIntPipe) historyLimit: number,
  ) {
    const item = await this.catalog.getItem(entityId, Math.min(Math.max(historyLimit, 0), 100));
    if (!item) throw new NotFoundException('פריט לא נמצא');
    return item;
  }

  @Get('api/item/:entityId/history')
  async getItemHistory(
    @Param('entityId') entityId: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    const result = await this.catalog.getItemHistory(entityId, Math.min(Math.max(limit, 1), 500));
    if (!result) throw new NotFoundException('פריט לא נמצא');
    return result;
  }

  @Get('api/makt/:makt/suppliers')
  async suppliersByMakt(@Param('makt') makt: string) {
    const suppliers = await this.catalog.getSuppliersForMakt(makt);
    return { catalogNumber: makt, count: suppliers.length, suppliers };
  }

  /** מרכזים רפואיים/ספקים שנותנים שירות למק"ט (הסכם + העשרה מ-myshikum). */
  @Get('api/makt/:makt/institutions')
  async institutionsByMakt(@Param('makt') makt: string) {
    const institutions = await this.catalog.getInstitutionsForMakt(makt);
    return { catalogNumber: makt, count: institutions.length, institutions };
  }

  /** מחזיר את קוד השירות (מחירון) של המק"ט, או serviceCode=null אם אין. */
  @Get('api/makt/:makt/service-code')
  async serviceCodeByMakt(@Param('makt') makt: string) {
    if (!makt || !makt.trim()) throw new BadRequestException('נדרש מספר מק"ט');
    return this.catalog.getServiceCodeForMakt(makt);
  }

  // --- Legacy endpoints (תאימות לאחור) ---
  @Get('items')
  async legacyItems(
    @Query('q') q: string,
    @Query('match', new DefaultValuePipe('contains')) match: string,
    @Query('field', new DefaultValuePipe('all')) field: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.listItems(q, match, field, limit, true);
  }

  @Get('item/:entityId')
  async legacyItem(@Param('entityId') entityId: string) {
    const item = await this.catalog.getItem(entityId, 20);
    if (!item) throw new NotFoundException('Item not found');
    return item;
  }
}
