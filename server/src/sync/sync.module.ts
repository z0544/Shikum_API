import { Module } from '@nestjs/common';
import { EtlModule } from '../etl/etl.module';
import { CatalogModule } from '../catalog/catalog.module';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

@Module({
  imports: [EtlModule, CatalogModule],
  controllers: [SyncController],
  providers: [SyncService],
  exports: [SyncService],
})
export class SyncModule {}
