import { Module } from '@nestjs/common';
import { ConfigMapService } from './config-map.service';

@Module({
  providers: [ConfigMapService],
  exports: [ConfigMapService],
})
export class ConfigMapModule {}
