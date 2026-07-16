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
import { PrismaService } from './prisma/prisma.service';
import { EtlService } from './etl/etl.service';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['log', 'warn', 'error'],
  });

  // CORS — רשימת מקורות מפורשת (CORS_ORIGINS) גוברת. ללא הגדרה: פתוח בפיתוח בלבד;
  // בפרודקשן בקשות חוצות-מקור נחסמות (ה-Frontend מוגש מאותו origin ולכן אינו מושפע).
  const corsRaw = process.env.CORS_ORIGINS?.trim();
  const isProd = process.env.NODE_ENV === 'production';
  if (corsRaw) {
    const origins = corsRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const allowAll = origins.includes('*');
    app.enableCors({
      origin: allowAll ? true : origins,
      credentials: !allowAll,
      exposedHeaders: ['Content-Disposition'],
    });
  } else if (isProd) {
    app.enableCors({ origin: false, exposedHeaders: ['Content-Disposition'] });
    logger.warn(
      'CORS_ORIGINS לא הוגדר בפרודקשן — בקשות חוצות-מקור נחסמות. הגדר CORS_ORIGINS לרשימת מקורות מותרים.',
    );
  } else {
    app.enableCors({ origin: true, exposedHeaders: ['Content-Disposition'] });
  }

  // ולידציה גלובלית ל-DTOs
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));

  // זריעת מיפויי הקונפיגורציה בעליית השרת
  try {
    await app.get(ConfigMapService).seedDefaults();
  } catch (e) {
    logger.warn(`דילוג על זריעת config-map (ייתכן שה-DB לא הוקם): ${(e as Error).message}`);
  }

  // טעינת נתונים אוטומטית בעלייה ראשונה — אם ה-DB ריק, מריץ ETL מקובצי server/data.
  // כך פריסה חדשה (למשל Render) מתאכלסת לבד ללא צעד ידני.
  try {
    const itemCount = await app.get(PrismaService).catalogItem.count();
    if (itemCount === 0) {
      logger.log('ה-DB ריק — מריץ טעינת נתונים ראשונית (ETL)...');
      const stats = await app.get(EtlService).processData();
      logger.log(`טעינה ראשונית הושלמה: ${JSON.stringify(stats)}`);
    }
  } catch (e) {
    logger.warn(`דילוג על טעינת נתונים אוטומטית: ${(e as Error).message}`);
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
