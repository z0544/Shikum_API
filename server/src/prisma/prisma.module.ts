import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/** מודול גלובלי — כך שכל מודול אחר יכול להזריק PrismaService ללא ייבוא חוזר. */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
