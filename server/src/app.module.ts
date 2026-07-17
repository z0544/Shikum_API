import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { ConfigMapModule } from './config-map/config-map.module';
import { GeoModule } from './geo/geo.module';
import { EtlModule } from './etl/etl.module';
import { CatalogModule } from './catalog/catalog.module';
import { ProvidersModule } from './providers/providers.module';
import { SearchModule } from './search/search.module';
import { ExportModule } from './export/export.module';
import { SyncModule } from './sync/sync.module';
import { AdminModule } from './admin/admin.module';
import { HealthModule } from './health/health.module';
import { RequestLoggerMiddleware } from './common/request-logger.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    ConfigMapModule,
    GeoModule,
    EtlModule,
    CatalogModule,
    ProvidersModule,
    SearchModule,
    ExportModule,
    SyncModule,
    AdminModule,
    HealthModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestLoggerMiddleware).forRoutes('*');
  }
}
