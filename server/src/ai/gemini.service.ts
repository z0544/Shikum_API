import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';

/**
 * עטיפה דקה סביב Gemini (@google/genai).
 * מופעל רק כאשר קיים מפתח API (GEMINI_API_KEY / GOOGLE_API_KEY) — אחרת המערכת
 * ממשיכה לעבוד במנוע החיפוש המקומי ללא AI.
 */
@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private client: GoogleGenAI | null = null;

  private get model(): string {
    return process.env.GEMINI_MODEL || 'gemini-flash-latest';
  }

  private getKey(): string | undefined {
    return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  }

  isEnabled(): boolean {
    return !!this.getKey();
  }

  private getClient(): GoogleGenAI | null {
    const key = this.getKey();
    if (!key) return null;
    if (!this.client) this.client = new GoogleGenAI({ apiKey: key });
    return this.client;
  }

  /**
   * מייצר תשובה טקסטואלית. מחזיר null אם ה-AI אינו מופעל או נכשל —
   * כדי שהקורא יוכל ליפול חזרה לתשובה המקומית.
   */
  async generate(systemInstruction: string, prompt: string): Promise<string | null> {
    const client = this.getClient();
    if (!client) return null;
    try {
      const res = await client.models.generateContent({
        model: this.model,
        contents: prompt,
        config: {
          systemInstruction,
          temperature: 0.3,
          maxOutputTokens: 600,
        },
      });
      const text = res.text?.trim();
      return text || null;
    } catch (e) {
      this.logger.warn(`קריאת Gemini נכשלה — נופל לתשובה מקומית: ${(e as Error).message}`);
      return null;
    }
  }

  /**
   * מייצר פלט JSON מובנה. מחזיר אובייקט מפוענח או null בכישלון.
   */
  async generateJson<T = Record<string, unknown>>(
    systemInstruction: string,
    prompt: string,
  ): Promise<T | null> {
    const client = this.getClient();
    if (!client) return null;
    try {
      const res = await client.models.generateContent({
        model: this.model,
        contents: prompt,
        config: {
          systemInstruction,
          temperature: 0.2,
          maxOutputTokens: 500,
          responseMimeType: 'application/json',
        },
      });
      const text = res.text?.trim();
      if (!text) return null;
      return JSON.parse(text) as T;
    } catch (e) {
      this.logger.warn(`קריאת Gemini (JSON) נכשלה: ${(e as Error).message}`);
      return null;
    }
  }

  /**
   * מנתח מסמך (PDF/תמונה) בעזרת Gemini ומחזיר JSON מובנה.
   * data — תוכן הקובץ בקידוד base64; mimeType — סוג הקובץ.
   */
  async analyzeDocumentJson<T = Record<string, unknown>>(
    systemInstruction: string,
    prompt: string,
    file: { mimeType: string; data: string },
  ): Promise<T | null> {
    const client = this.getClient();
    if (!client) return null;
    try {
      const res = await client.models.generateContent({
        model: this.model,
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }, { inlineData: { mimeType: file.mimeType, data: file.data } }],
          },
        ],
        config: {
          systemInstruction,
          temperature: 0.2,
          maxOutputTokens: 700,
          responseMimeType: 'application/json',
        },
      });
      const text = res.text?.trim();
      if (!text) return null;
      return JSON.parse(text) as T;
    } catch (e) {
      this.logger.warn(`ניתוח מסמך ב-Gemini נכשל: ${(e as Error).message}`);
      return null;
    }
  }
}
