import * as path from 'path';

/**
 * תיקיית הנתונים (server/data) — עובדת גם ב-ts-node (src/...) וגם אחרי build (dist/...),
 * מאחר ששני המקרים נמצאים 2 רמות מתחת לשורש ה-server.
 * ניתן לעקוף עם משתנה הסביבה DATA_DIR.
 */
export const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(__dirname, '../../data');

export function dataFile(name: string): string {
  return path.join(DATA_DIR, name);
}
