import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const API_VERSION = '1.0.0';

@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('health')
  async health() {
    let dbOk = false;
    let itemCount = 0;
    try {
      itemCount = await this.prisma.catalogItem.count();
      dbOk = true;
    } catch {
      dbOk = false;
    }
    const aiEnabled = !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
    return {
      status: 'ok',
      version: API_VERSION,
      database_ready: dbOk,
      item_count: itemCount,
      smart_search: aiEnabled ? 'gemini' : 'local',
    };
  }
}
