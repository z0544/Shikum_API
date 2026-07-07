import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { GeoModule } from '../geo/geo.module';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

@Module({
  imports: [CatalogModule, GeoModule],
  controllers: [SearchController],
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}
