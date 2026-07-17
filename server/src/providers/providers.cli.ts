import { loadEnv } from '../common/load-env';
loadEnv();

import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../app.module';
import { ProviderDirectoryService } from './provider-directory.service';

/** רענון ספריית הספקים משורת הפקודה: `npm run providers:sync` (לתזמון שבועי). */
async function main() {
  const logger = new Logger('ProvidersSync');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });
  try {
    const svc = app.get(ProviderDirectoryService);
    logger.log('מרענן ספריית ספקים מ-myshikum...');
    const stats = await svc.sync();
    logger.log(`הרענון הושלם: ${JSON.stringify(stats)}`);
  } catch (err) {
    logger.error(`רענון ספקים נכשל: ${(err as Error).message}`, (err as Error).stack);
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

void main();
