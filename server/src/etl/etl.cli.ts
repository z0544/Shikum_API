import { loadEnv } from '../common/load-env';
loadEnv();

import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../app.module';
import { EtlService } from './etl.service';

/** הרצת ETL משורת הפקודה: `npm run etl`. */
async function main() {
  const logger = new Logger('ETL');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });
  try {
    const etl = app.get(EtlService);
    logger.log('מתחיל טעינת נתונים מקובצי ה-XLSX...');
    const stats = await etl.processData();
    logger.log(`הטעינה הושלמה: ${JSON.stringify(stats)}`);
  } catch (err) {
    logger.error(`ETL נכשל: ${(err as Error).message}`, (err as Error).stack);
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

void main();
