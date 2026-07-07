import { loadEnv } from './common/load-env';
loadEnv();

import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { AppModule } from './app.module';
import { ConfigMapService } from './config-map/config-map.service';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['log', 'warn', 'error'],
  });

  // CORS — לפי ENV, ברירת מחדל פתוח לכול (תאימות לפיתוח)
  const origins = (process.env.CORS_ORIGINS || '*').split(',').map((s) => s.trim());
  const allowAll = origins.includes('*');
  app.enableCors({
    origin: allowAll ? true : origins,
    credentials: !allowAll,
    exposedHeaders: ['Content-Disposition'],
  });

  // ולידציה גלובלית ל-DTOs
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));

  // זריעת מיפויי הקונפיגורציה בעליית השרת
  try {
    await app.get(ConfigMapService).seedDefaults();
  } catch (e) {
    logger.warn(`דילוג על זריעת config-map (ייתכן שה-DB לא הוקם): ${(e as Error).message}`);
  }

  // הגשת ה-Frontend הבנוי (אם קיים) — client/dist
  const clientDist = path.resolve(__dirname, '../../client/dist');
  if (fs.existsSync(clientDist)) {
    app.useStaticAssets(clientDist);
    // SPA fallback — כל נתיב שאינו API מחזיר את index.html
    app.use((req: Request, res: Response, next: () => void) => {
      if (req.method === 'GET' && !req.path.startsWith('/api') && req.path !== '/health' && !path.extname(req.path)) {
        return res.sendFile(path.join(clientDist, 'index.html'));
      }
      next();
    });
    logger.log('מגיש Frontend בנוי מ-client/dist');
  }

  const port = Number(process.env.PORT || 3000);
  await app.listen(port);
  logger.log(`SHIKUM_API פועל על http://localhost:${port}`);
}

void bootstrap();
