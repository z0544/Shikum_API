import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * שירות Prisma יחיד לכל האפליקציה — מנהל את חיבור בסיס הנתונים.
 * מתחבר בעליית המודול ומתנתק בסגירתו.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    await this.$connect();
    await this.ensureSearchIndexes();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * מוודא (אידמפוטנטית) שקיימת הרחבת pg_trgm ואינדקס GIN טריגרמי על התיאור —
   * לחיפוש עמיד-לשגיאות ומהיר. אם ההרחבה דורשת הרשאות שאינן קיימות (למשל DB מנוהל),
   * נופלים בשקט לחיפוש ה-contains הרגיל.
   */
  private async ensureSearchIndexes(): Promise<void> {
    try {
      await this.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS pg_trgm');
      await this.$executeRawUnsafe(
        'CREATE INDEX IF NOT EXISTS catalog_items_description_trgm ON catalog_items USING gin (description gin_trgm_ops)',
      );
      this.logger.log('pg_trgm מוכן (אינדקס טריגרמי על description)');
    } catch (e) {
      this.logger.warn(`לא ניתן להקים pg_trgm — ממשיכים בחיפוש רגיל: ${(e as Error).message}`);
    }
  }
}
