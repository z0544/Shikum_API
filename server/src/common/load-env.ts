import * as fs from 'fs';
import * as path from 'path';

/**
 * טוען משתני סביבה מקובץ .env בשורש ה-server (אם קיים) לפני אתחול Prisma.
 * טעינה ידנית ופשוטה — לא דורסת משתנים שכבר הוגדרו בסביבה.
 * מספק גם ברירת מחדל ל-DATABASE_URL כדי שהמערכת תעבוד מיד ללא הגדרות.
 */
export function loadEnv(): void {
  const envPath = path.resolve(__dirname, '../../.env');
  try {
    if (fs.existsSync(envPath)) {
      const raw = fs.readFileSync(envPath, 'utf-8').replace(/^﻿/, '');
      for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
        const idx = trimmed.indexOf('=');
        const key = trimmed.slice(0, idx).trim();
        let val = trimmed.slice(idx + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        if (!(key in process.env)) process.env[key] = val;
      }
    }
  } catch {
    /* מתעלמים — נשען על ברירות מחדל */
  }
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = 'file:./dev.db';
  }
}
