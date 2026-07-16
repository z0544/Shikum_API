import {
  BadRequestException,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AdminGuard } from '../admin/admin.guard';
import { FileKind } from '../common/columns';
import { CatalogRepository } from '../catalog/catalog.repository';
import { SyncService } from './sync.service';

const VALID_KINDS: FileKind[] = ['items', 'suppliers', 'agreements'];

function parseKind(kind: string): FileKind {
  if (!VALID_KINDS.includes(kind as FileKind)) {
    throw new BadRequestException(`סוג קובץ לא תקין: ${kind} (items|suppliers|agreements)`);
  }
  return kind as FileKind;
}

/** נקודות קצה ניהוליות לסנכרון דלתאות (דורש X-Admin-Token). */
@UseGuards(AdminGuard)
@Controller('api/admin')
export class SyncController {
  constructor(
    private readonly sync: SyncService,
    private readonly catalogRepo: CatalogRepository,
  ) {}

  @Post('sync/:kind/preview')
  @UseInterceptors(FileInterceptor('file'))
  async preview(@Param('kind') kind: string, @UploadedFile() file?: Express.Multer.File) {
    if (!file?.buffer?.length) throw new BadRequestException('לא הועלה קובץ');
    try {
      return await this.sync.computePlan(parseKind(kind), file.buffer, file.originalname || 'upload');
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  @Post('sync/:kind/apply')
  @UseInterceptors(FileInterceptor('file'))
  async apply(
    @Param('kind') kind: string,
    @Query('force') force?: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file?.buffer?.length) throw new BadRequestException('לא הועלה קובץ');
    const forced = force === 'true' || force === '1';
    try {
      return await this.sync.apply(parseKind(kind), file.buffer, file.originalname || 'upload', {
        force: forced,
      });
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  @Get('sync-runs')
  async runs(@Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number) {
    return { runs: await this.sync.listSyncRuns(Math.min(Math.max(limit, 1), 200)) };
  }

  @Get('items/:entityKey/history')
  async history(
    @Param('entityKey') entityKey: string,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
  ) {
    const history = await this.catalogRepo.itemHistory(entityKey, Math.min(Math.max(limit, 1), 500));
    return { entityKey, history };
  }
}
