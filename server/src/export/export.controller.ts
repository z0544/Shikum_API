import {
  BadRequestException,
  Controller,
  DefaultValuePipe,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { CatalogService } from '../catalog/catalog.service';
import { SearchService } from '../search/search.service';
import { ExportService } from './export.service';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

@Controller('api/export')
export class ExportController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly search: SearchService,
    private readonly exporter: ExportService,
  ) {}

  private send(res: Response, buffer: Buffer, filename: string): void {
    res.set({
      'Content-Type': XLSX_MIME,
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    });
    res.send(buffer);
  }

  @Get('search')
  async exportSearch(
    @Res() res: Response,
    @Query('q') q: string,
    @Query('match', new DefaultValuePipe('contains')) match: string,
    @Query('field', new DefaultValuePipe('all')) field: string,
    @Query('limit', new DefaultValuePipe(500), ParseIntPipe) limit: number,
  ) {
    if (!q || !q.trim()) throw new BadRequestException('נדרש ערך לחיפוש (q)');
    const payload = await this.catalog.search({
      q,
      match,
      field,
      limit: Math.min(Math.max(limit, 1), 500),
      grouped: true,
    });
    if ((payload.count as number) === 0) throw new NotFoundException('לא נמצאו תוצאות לייצוא');
    const buffer = await this.exporter.buildSearchExport({
      query: q,
      match: payload.match as string,
      field,
      groups: (payload.groups as any[]) || [],
      items: (payload.items as any[]) || [],
    });
    this.send(res, buffer, `shikum_search_${q.replace(/\s+/g, '_').slice(0, 30)}.xlsx`);
  }

  @Get('makt/:makt')
  async exportMakt(
    @Res() res: Response,
    @Param('makt') makt: string,
    @Query('entity_id') entityId?: string,
  ) {
    const variants = await this.catalog.getItemsForMakt(makt);
    if (!variants.length) throw new NotFoundException('מק״ט לא נמצא');
    const suppliers = await this.catalog.getSuppliersForMakt(makt);
    let selectedVariant: Record<string, any> | null = null;
    if (entityId) {
      selectedVariant = await this.catalog.getItem(entityId, 0);
      if (!selectedVariant) throw new NotFoundException('וריאנט לא נמצא');
    }
    const buffer = await this.exporter.buildMaktExport({
      makt,
      variants,
      suppliers,
      selectedEntityId: entityId,
      selectedVariant,
    });
    this.send(res, buffer, `shikum_makt_${makt}.xlsx`);
  }

  @Get('ai/search')
  async exportAiSearch(
    @Res() res: Response,
    @Query('query') query: string,
    @Query('limit_makts', new DefaultValuePipe(15), ParseIntPipe) limitMakts: number,
  ) {
    if (!query || query.trim().length < 3) throw new BadRequestException('שאילתה קצרה מדי');
    const result = await this.search.runAiSearch(query.trim(), {
      limitMakts: Math.min(Math.max(limitMakts, 1), 50),
    });
    if (!result.results?.length) {
      throw new NotFoundException(result.message || 'לא נמצאו תוצאות לייצוא');
    }
    const buffer = await this.exporter.buildAiSearchExport(result);
    this.send(res, buffer, `shikum_ai_${query.trim().replace(/\s+/g, '_').slice(0, 24)}.xlsx`);
  }
}
