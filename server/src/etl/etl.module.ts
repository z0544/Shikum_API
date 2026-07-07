import { Module } from '@nestjs/common';
import { ConfigMapModule } from '../config-map/config-map.module';
import { GeoModule } from '../geo/geo.module';
import { EtlService } from './etl.service';

@Module({
  imports: [ConfigMapModule, GeoModule],
  providers: [EtlService],
  exports: [EtlService],
})
export class EtlModule {}
