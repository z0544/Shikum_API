import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { GeoModule } from '../geo/geo.module';
import { GeminiService } from '../ai/gemini.service';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

@Module({
  imports: [CatalogModule, GeoModule],
  controllers: [SearchController],
  providers: [SearchService, GeminiService],
  exports: [SearchService],
})
export class SearchModule {}
