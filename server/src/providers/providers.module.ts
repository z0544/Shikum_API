import { Module } from '@nestjs/common';
import { ProvidersController } from './providers.controller';
import { ProviderDirectoryService } from './provider-directory.service';

@Module({
  controllers: [ProvidersController],
  providers: [ProviderDirectoryService],
  exports: [ProviderDirectoryService],
})
export class ProvidersModule {}
