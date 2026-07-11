import { Module } from '@nestjs/common';
import { EtlModule } from '../etl/etl.module';
import { CatalogModule } from '../catalog/catalog.module';
import { SearchModule } from '../search/search.module';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

@Module({
  imports: [EtlModule, CatalogModule, SearchModule],
  controllers: [SyncController],
  providers: [SyncService],
  exports: [SyncService],
})
export class SyncModule {}
