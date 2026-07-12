import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsInt, IsString, MinLength } from 'class-validator';
import { AdminGuard } from './admin.guard';
import { EtlService } from '../etl/etl.service';
import { ConfigMapService } from '../config-map/config-map.service';
import { CatalogRepository } from '../catalog/catalog.repository';
import { SearchService } from '../search/search.service';

class ConfigMapDto {
  @IsString() @MinLength(1) field!: string;
  @IsString() @MinLength(1) textValue!: string;
  @IsInt() intValue!: number;
}

class SynonymDto {
  @IsString() @MinLength(1) term!: string;
  @IsString() @MinLength(1) target!: string;
}

/** ניהול: טעינה מחדש של הנתונים + עריכת מילון הקונפיגורציה. דורש X-Admin-Token. */
@UseGuards(AdminGuard)
@Controller('api/admin')
export class AdminController {
  constructor(
    private readonly etl: EtlService,
    private readonly config: ConfigMapService,
    private readonly catalogRepo: CatalogRepository,
    private readonly search: SearchService,
  ) {}

  @Post('reload-data')
  async reload() {
    const stats = await this.etl.processData();
    this.catalogRepo.invalidateSupplierCache();
    this.search.invalidateVocab();
    return { status: 'ok', rows: stats };
  }

  @Get('config-map')
  async listConfig(@Query('field') field?: string) {
    return { items: await this.config.list(field) };
  }

  @Put('config-map')
  async upsertConfig(@Body() body: ConfigMapDto) {
    return this.config.upsert(body.field, body.textValue, body.intValue);
  }

  @Delete('config-map/:id')
  async deleteConfig(@Param('id', ParseIntPipe) id: number) {
    return this.config.remove(id);
  }

  // --- שאילתות ללא מענה (backlog לנרדפות) ---
  @Get('unanswered')
  async unanswered(@Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number) {
    return { items: await this.search.listUnanswered(Math.min(Math.max(limit, 1), 500)) };
  }

  // --- ניהול מילון נרדפות (ללא deploy) ---
  @Get('synonyms')
  async listSynonyms() {
    return { items: await this.search.listSynonyms() };
  }

  @Put('synonyms')
  async addSynonym(@Body() body: SynonymDto) {
    return this.search.addSynonym(body.term, body.target);
  }

  @Delete('synonyms/:id')
  async deleteSynonym(@Param('id', ParseIntPipe) id: number) {
    return this.search.deleteSynonym(id);
  }
}
