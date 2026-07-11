import { Module } from '@nestjs/common';
import { EtlModule } from '../etl/etl.module';
import { ConfigMapModule } from '../config-map/config-map.module';
import { CatalogModule } from '../catalog/catalog.module';
import { SearchModule } from '../search/search.module';
import { AdminController } from './admin.controller';

@Module({
  imports: [EtlModule, ConfigMapModule, CatalogModule, SearchModule],
  controllers: [AdminController],
})
export class AdminModule {}
