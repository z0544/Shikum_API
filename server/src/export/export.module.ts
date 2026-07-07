import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { SearchModule } from '../search/search.module';
import { ExportController } from './export.controller';
import { ExportService } from './export.service';

@Module({
  imports: [CatalogModule, SearchModule],
  controllers: [ExportController],
  providers: [ExportService],
})
export class ExportModule {}
